import { NextResponse } from 'next/server'
import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import YAML from 'yaml'
import { getSearchDir } from '@/lib/paths'

interface ParsedMessage {
  id: string
  recipient: string
  company: string
  role: string
  text: string
  charCount: number
  personalization: string
  source: string
  status: 'draft' | 'sent'
}

export async function GET() {
  try {
    const searchDir = getSearchDir()
    const allMessages: ParsedMessage[] = []

    // Read from search/output/messages/ — YAML batch files
    const messagesDir = join(searchDir, 'output', 'messages')
    if (existsSync(messagesDir)) {
      for (const file of readdirSync(messagesDir)) {
        const filepath = join(messagesDir, file)
        const content = readFileSync(filepath, 'utf-8')

        // Try YAML parse for structured batch files
        if (file.endsWith('.yaml') || file.endsWith('.yml')) {
          try {
            const parsed = YAML.parse(content)
            if (parsed?.messages && Array.isArray(parsed.messages)) {
              for (const msg of parsed.messages) {
                allMessages.push({
                  id: `${file}-${msg.id || allMessages.length}`,
                  recipient: msg.recipient || msg.name || '',
                  company: msg.target_company || msg.company || '',
                  role: msg.role || '',
                  text: msg.message || msg.text || '',
                  charCount: msg.character_count || (msg.message || '').length,
                  personalization: msg.personalization || '',
                  source: file,
                  status: 'draft',
                })
              }
              continue
            }
          } catch { /* not valid YAML, try markdown parsing */ }
        }

        // Try markdown parsing for .md files
        if (file.endsWith('.md')) {
          const sections = content.split(/(?=(?:^|\n)(?:#{1,3}\s+)?\d+[\.\)]\s)/m).filter(Boolean)
          for (const section of sections) {
            const companyMatch = section.match(/\*{0,2}([\w][\w\s&.]+?)\*{0,2}\s*(?:—|–|-|:|\()/m)
            const company = companyMatch ? companyMatch[1].trim() : ''
            const quotedMatch = section.match(/"([^"]{20,300})"/)
              || section.match(/"([^"]{20,300})"/)
            if (quotedMatch && company) {
              const text = quotedMatch[1].trim()
              allMessages.push({
                id: `${file}-${allMessages.length}`,
                recipient: '',
                company,
                role: '',
                text,
                charCount: text.length,
                personalization: '',
                source: file,
                status: 'draft',
              })
            }
          }
        }
      }
    }

    // Also check entries/ for connection-request entries with embedded messages
    const entriesDir = join(searchDir, 'entries')
    if (existsSync(entriesDir)) {
      for (const file of readdirSync(entriesDir)) {
        if (!file.startsWith('connection-request')) continue
        const content = readFileSync(join(entriesDir, file), 'utf-8')
        // Try to find YAML block in the entry
        const yamlBlock = content.match(/```yaml\n([\s\S]*?)```/)
        if (yamlBlock) {
          try {
            const parsed = YAML.parse(yamlBlock[1])
            if (parsed?.messages && Array.isArray(parsed.messages)) {
              for (const msg of parsed.messages) {
                allMessages.push({
                  id: `${file}-${msg.id || allMessages.length}`,
                  recipient: msg.recipient || '',
                  company: msg.target_company || msg.company || '',
                  role: msg.role || '',
                  text: msg.message || msg.text || '',
                  charCount: msg.character_count || (msg.message || '').length,
                  personalization: msg.personalization || '',
                  source: file,
                  status: 'draft',
                })
              }
            }
          } catch {}
        }
      }
    }

    return NextResponse.json({ messages: allMessages, total: allMessages.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
