/**
 * /api/networking/contacts
 * GET: List all contacts from connection-tracker
 * POST: Add a new contact
 * PUT: Update an existing contact (by id)
 */

import { NextResponse } from 'next/server'
import { readContext, writeContext, acquireLock, ConnectionTrackerSchema } from '@/lib/context'
import { z } from 'zod'

type ConnectionTracker = z.infer<typeof ConnectionTrackerSchema>

export async function GET() {
  try {
    const tracker = (await readContext('connection-tracker')) as ConnectionTracker
    return NextResponse.json({ contacts: tracker.contacts })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

interface NewContact {
  name: string
  company: string
  role?: string
  relationship?: string
  linkedin_url?: string
  notes?: string
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as NewContact

    if (!body.name || !body.company) {
      return NextResponse.json(
        { error: 'name and company are required' },
        { status: 400 },
      )
    }

    const release = await acquireLock('connection-tracker')
    try {
      const tracker = (await readContext('connection-tracker')) as ConnectionTracker
      const contacts = tracker.contacts ?? []

      // Generate next ID
      const maxNum = contacts.reduce((max: number, c: { id: string }) => {
        const match = c.id.match(/^conn-(\d+)$/)
        return match ? Math.max(max, parseInt(match[1], 10)) : max
      }, 0)
      const newId = `conn-${String(maxNum + 1).padStart(3, '0')}`

      const newContact = {
        id: newId,
        name: body.name,
        company: body.company,
        role: body.role || '',
        relationship: (body.relationship as 'cold' | 'connected' | 'warm' | 'referred') || 'cold',
        linkedin_url: body.linkedin_url || '',
        outreach: [],
        follow_ups: [],
        notes: body.notes || '',
      }

      contacts.push(newContact)
      await writeContext('connection-tracker', { contacts })

      return NextResponse.json({ contact: newContact }, { status: 201 })
    } finally {
      release()
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

interface UpdateContact {
  id: string
  field: string
  value: unknown
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as UpdateContact

    if (!body.id || !body.field) {
      return NextResponse.json(
        { error: 'id and field are required' },
        { status: 400 },
      )
    }

    const release = await acquireLock('connection-tracker')
    try {
      const tracker = (await readContext('connection-tracker')) as ConnectionTracker
      const contacts = tracker.contacts ?? []
      const idx = contacts.findIndex((c: { id: string }) => c.id === body.id)

      if (idx === -1) {
        return NextResponse.json(
          { error: `Contact not found: ${body.id}` },
          { status: 404 },
        )
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const contact = contacts[idx] as any
      contact[body.field] = body.value
      contacts[idx] = contact as ConnectionTracker['contacts'][number]

      await writeContext('connection-tracker', { contacts })
      return NextResponse.json({ contact: contacts[idx] })
    } finally {
      release()
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
