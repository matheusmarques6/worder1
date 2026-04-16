/**
 * CRON: Update optimal send times per contact
 * /api/cron/update-send-times
 *
 * Analyzes email open timestamps to determine each contact's best send hour.
 * Like Klaviyo's Smart Send Time — learns from historical engagement.
 *
 * Runs daily (off-peak, e.g. 3am).
 */

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function isAuthorized(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return process.env.NODE_ENV !== 'production'
  return req.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    // Get contacts who have opens in the last 90 days
    const { data: opens } = await supabaseAdmin
      .from('email_sends')
      .select('contact_id, opened_at')
      .not('opened_at', 'is', null)
      .gte('opened_at', new Date(Date.now() - 90 * 86400000).toISOString())
      .limit(50000)

    if (!opens || opens.length === 0) {
      return NextResponse.json({ updated: 0, message: 'No open data' })
    }

    // Group open hours by contact
    const contactHours = new Map<string, number[]>()
    for (const o of opens) {
      if (!o.contact_id || !o.opened_at) continue
      const hour = new Date(o.opened_at).getUTCHours()
      if (!contactHours.has(o.contact_id)) contactHours.set(o.contact_id, [])
      contactHours.get(o.contact_id)!.push(hour)
    }

    let updated = 0

    // Calculate best hour per contact (mode of open hours)
    const batchUpdates: { id: string; best_send_hour: number; engagement_score: number }[] = []

    for (const [contactId, hours] of contactHours) {
      if (hours.length < 2) continue // need at least 2 opens for signal

      // Find mode (most frequent hour)
      const freq = new Map<number, number>()
      for (const h of hours) freq.set(h, (freq.get(h) || 0) + 1)
      let bestHour = 10 // default
      let maxFreq = 0
      for (const [h, f] of freq) {
        if (f > maxFreq) { maxFreq = f; bestHour = h }
      }

      // Engagement score: 0-100 based on recent open rate
      // More opens in 90 days = higher score
      const score = Math.min(100, Math.round(hours.length * 10))

      batchUpdates.push({ id: contactId, best_send_hour: bestHour, engagement_score: score })
    }

    // Batch update in chunks of 100
    for (let i = 0; i < batchUpdates.length; i += 100) {
      const chunk = batchUpdates.slice(i, i + 100)
      for (const u of chunk) {
        await supabaseAdmin
          .from('contacts')
          .update({ best_send_hour: u.best_send_hour, engagement_score: u.engagement_score })
          .eq('id', u.id)
        updated++
      }
    }

    // Decay engagement for contacts with no opens in 90 days
    const { count: decayed } = await supabaseAdmin
      .from('contacts')
      .update({ engagement_score: 10 })
      .gt('engagement_score', 10)
      .not('id', 'in', `(${Array.from(contactHours.keys()).slice(0, 1000).join(',')})`)
      .lt('last_email_sent_at', new Date(Date.now() - 90 * 86400000).toISOString())

    return NextResponse.json({
      updated,
      totalContactsAnalyzed: contactHours.size,
      engagementDecayed: decayed || 0,
    })
  } catch (err: any) {
    console.error('[update-send-times]', err)
    return NextResponse.json({ error: err?.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  return GET(req)
}
