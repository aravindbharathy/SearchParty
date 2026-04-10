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
    const raw = YAML.parse(readFileSync(fp, 'utf-8'))
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

  const messagesDir = join(searchDir, 'output', 'messages')
  if (!existsSync(messagesDir)) return imported

  for (const file of readdirSync(messagesDir)) {
    if (!file.endsWith('.yaml') && !file.endsWith('.yml')) continue
    try {
      const content = readFileSync(join(messagesDir, file), 'utf-8')
      const parsed = YAML.parse(content)
      if (!parsed?.messages || !Array.isArray(parsed.messages)) continue

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
        })
      }
    } catch { /* skip bad files */ }
  }

  return imported
}

// GET — read all messages (imports from agent files if store is empty)
export async function GET() {
  try {
    let store = loadStore()

    // If store is empty but agent files exist, import them
    if (store.messages.length === 0) {
      const imported = importFromAgentFiles()
      if (imported.length > 0) {
        store.messages = imported
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
