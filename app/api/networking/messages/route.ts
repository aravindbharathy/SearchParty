import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

interface Message {
  id: string
  recipient: string
  company: string
  role: string
  text: string
  charCount: number
  personalization: string
  status: 'draft' | 'sent' | 'archived'
  createdAt: string
  sentAt?: string
  batch?: string
}

interface MessagesStore {
  messages: Message[]
}

function getStorePath(): string {
  return join(getSearchDir(), 'pipeline', 'messages.yaml')
}

function loadStore(): MessagesStore {
  const fp = getStorePath()
  if (!existsSync(fp)) return { messages: [] }
  try {
    const raw = YAML.parse(readFileSync(fp, 'utf-8'), { uniqueKeys: false })
    return { messages: Array.isArray(raw?.messages) ? raw.messages : [] }
  } catch {
    return { messages: [] }
  }
}

function saveStore(store: MessagesStore): void {
  const fp = getStorePath()
  const dir = join(fp, '..')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  writeFileSync(fp, YAML.stringify(store))
}

/**
 * Import messages from agent-generated YAML files into the store.
 * Only imports messages that don't already exist (by text match).
 */
function importFromAgentFiles(): Message[] {
  const searchDir = getSearchDir()
  const imported: Message[] = []

  const messagesDir = join(searchDir, 'vault', 'generated', 'messages')
  if (!existsSync(messagesDir)) return imported

  for (const file of readdirSync(messagesDir)) {
    const filePath = join(messagesDir, file)

    // Handle YAML files (structured message batches)
    if (file.endsWith('.yaml') || file.endsWith('.yml')) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const parsed = YAML.parse(content)
        if (!parsed?.messages || !Array.isArray(parsed.messages)) continue

        const date = parsed.generated_date || ''
        const dateStr = date ? ` · ${date}` : ''
        const count = parsed.messages.length

        let batchLabel: string
        if (parsed.strategy_note) {
          const note = String(parsed.strategy_note)
          batchLabel = `${note.split('.')[0].slice(0, 40)} (${count})${dateStr}`
        } else {
          const roles = parsed.messages.slice(0, 5).map((m: Record<string, string>) => m.role || '')
          const isResearch = roles.some((r: string) => /research|ux/i.test(r))
          batchLabel = `${isResearch ? 'UX Research' : 'Outreach'} (${count})${dateStr}`
        }

        for (const msg of parsed.messages) {
          imported.push({
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            recipient: msg.recipient || msg.name || '',
            company: msg.target_company || msg.company || '',
            role: msg.role || '',
            text: msg.message || msg.text || '',
            charCount: msg.character_count || (msg.message || '').length,
            personalization: msg.personalization || '',
            status: 'draft',
            createdAt: parsed.generated_date || new Date().toISOString().split('T')[0],
            batch: batchLabel,
          })
        }
      } catch { /* skip bad files */ }
      continue
    }

    // Handle markdown files (agent wrote freeform instead of YAML)
    if (file.endsWith('.md')) {
      try {
        const content = readFileSync(filePath, 'utf-8')
        const titleMatch = content.match(/^#\s+(.+)/m)
        const title = titleMatch?.[1] || file.replace('.md', '')
        // Extract recipient and company from title like "Referral Request: Name at Company"
        const rcMatch = title.match(/(?:Referral|Connection|Message).*?:\s*(.+?)\s+at\s+(.+)/i)
        const contactMatch = content.match(/\*\*Contact\*\*:\s*(.+?)(?:\s*[—-]|$)/m)
        const recipient = rcMatch?.[1] || contactMatch?.[1] || title
        const company = rcMatch?.[2] || ''
        const dateMatch = file.match(/(\d{4}-\d{2}-\d{2})/)
        const date = dateMatch?.[1] || new Date().toISOString().split('T')[0]
        imported.push({
          id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          recipient,
          company,
          role: '',
          text: content,
          charCount: content.length,
          personalization: '',
          status: 'draft',
          createdAt: date,
          batch: title,
        })
      } catch { /* skip */ }
    }
  }

  return imported
}

// GET — read all messages (always checks for new agent files to merge)
export async function GET() {
  try {
    let store = loadStore()

    // Check agent files for new messages not yet in the store
    const imported = importFromAgentFiles()
    if (imported.length > 0) {
      const existingTexts = new Set(store.messages.map(m => m.text.slice(0, 80)))
      const newMessages = imported.filter(m => !existingTexts.has(m.text.slice(0, 80)))
      if (newMessages.length > 0) {
        store.messages.push(...newMessages)
        saveStore(store)
      }
    }

    const drafts = store.messages.filter(m => m.status === 'draft')
    const sent = store.messages.filter(m => m.status === 'sent')

    return NextResponse.json({
      messages: store.messages,
      total: store.messages.length,
      drafts: drafts.length,
      sent: sent.length,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// PUT — update a message (edit text, mark as sent, archive)
export async function PUT(req: Request) {
  try {
    const body = await req.json() as { id: string; field: string; value: unknown }
    const store = loadStore()
    const idx = store.messages.findIndex(m => m.id === body.id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    const msg = store.messages[idx]
    if (body.field === 'text') {
      msg.text = body.value as string
      msg.charCount = (body.value as string).length
    } else if (body.field === 'status') {
      msg.status = body.value as Message['status']
      if (body.value === 'sent') {
        msg.sentAt = new Date().toISOString()
      }
    } else {
      (msg as unknown as Record<string, unknown>)[body.field] = body.value
    }

    store.messages[idx] = msg
    saveStore(store)

    return NextResponse.json({ message: msg })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// DELETE — remove a message
export async function DELETE(req: Request) {
  try {
    const body = await req.json() as { id: string }
    const store = loadStore()
    const idx = store.messages.findIndex(m => m.id === body.id)
    if (idx === -1) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    }

    store.messages.splice(idx, 1)
    saveStore(store)

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

// POST — add messages (from new batch generation or manual)
export async function POST(req: Request) {
  try {
    const body = await req.json() as { action: string; messages?: Message[] }

    if (body.action === 'reimport') {
      // Re-import from agent files (overwrites store)
      const imported = importFromAgentFiles()
      const store: MessagesStore = { messages: imported }
      saveStore(store)
      return NextResponse.json({ messages: imported, total: imported.length })
    }

    if (body.action === 'clear') {
      // Archive all drafts
      const store = loadStore()
      for (const msg of store.messages) {
        if (msg.status === 'draft') msg.status = 'archived'
      }
      saveStore(store)
      return NextResponse.json({ ok: true })
    }

    if (body.action === 'add' && body.messages) {
      const store = loadStore()
      store.messages.push(...body.messages)
      saveStore(store)
      return NextResponse.json({ total: store.messages.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
