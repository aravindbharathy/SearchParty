/**
 * GET /api/networking/stats
 * Returns networking stats: total contacts, reply rate, referrals secured.
 */

import { NextResponse } from 'next/server'
import { readContext, ConnectionTrackerSchema } from '@/lib/context'
import { z } from 'zod'

type ConnectionTracker = z.infer<typeof ConnectionTrackerSchema>

export async function GET() {
  try {
    const tracker = (await readContext('connection-tracker')) as ConnectionTracker
    const contacts = tracker.contacts ?? []

    let totalOutreach = 0
    let totalReplies = 0
    let referrals = 0
    let pendingFollowUps = 0

    for (const contact of contacts) {
      if (contact.relationship === 'referred') {
        referrals++
      }

      for (const outreach of contact.outreach ?? []) {
        totalOutreach++
        if (outreach.status === 'replied') {
          totalReplies++
        }
      }

      for (const fu of contact.follow_ups ?? []) {
        if (fu.status === 'pending') {
          pendingFollowUps++
        }
      }
    }

    const replyRate = totalOutreach > 0
      ? Math.round((totalReplies / totalOutreach) * 100)
      : 0

    return NextResponse.json({
      totalContacts: contacts.length,
      totalOutreach,
      totalReplies,
      replyRate,
      referrals,
      pendingFollowUps,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
