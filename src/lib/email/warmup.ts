import { supabaseAdmin } from '@/lib/supabase-admin'

// Klaviyo-inspired warm-up schedule: conservative ramp over 30 days.
// Day 0 = domain just verified. Most engaged contacts go first.
const WARMUP_SCHEDULE: Record<number, number> = {
  1: 200,   2: 400,   3: 600,   4: 800,   5: 1000,
  6: 1500,  7: 2000,  8: 3000,  9: 4000,  10: 5000,
  11: 6000, 12: 7500, 13: 9000, 14: 10000,
  15: 12000, 16: 15000, 17: 18000, 18: 20000,
  19: 25000, 20: 30000, 21: 35000, 22: 40000,
  23: 45000, 24: 50000, 25: 60000, 26: 70000,
  27: 80000, 28: 90000, 29: 100000, 30: -1, // -1 = unlimited
}

export interface WarmupStatus {
  allowed: boolean
  dailyLimit: number
  sentToday: number
  remaining: number
  warmupDay: number
  isWarmingUp: boolean
}

export async function getWarmupStatus(orgId: string, fromEmail: string): Promise<WarmupStatus> {
  const domain = fromEmail.split('@')[1]?.toLowerCase()
  if (!domain) return { allowed: true, dailyLimit: -1, sentToday: 0, remaining: -1, warmupDay: 0, isWarmingUp: false }

  const { data: domainRow } = await supabaseAdmin
    .from('email_domains')
    .select('warmup_enabled, warmup_started_at, warmup_day, warmup_daily_limit, total_sent_today, last_sent_date')
    .eq('organization_id', orgId)
    .eq('domain', domain)
    .maybeSingle()

  if (!domainRow || !domainRow.warmup_enabled) {
    return { allowed: true, dailyLimit: -1, sentToday: 0, remaining: -1, warmupDay: 0, isWarmingUp: false }
  }

  const today = new Date().toISOString().split('T')[0]
  let sentToday = domainRow.total_sent_today || 0

  // Reset daily counter if new day
  if (domainRow.last_sent_date !== today) {
    sentToday = 0
    const newDay = (domainRow.warmup_day || 0) + 1
    const newLimit = WARMUP_SCHEDULE[newDay] || WARMUP_SCHEDULE[30] || -1

    await supabaseAdmin
      .from('email_domains')
      .update({
        total_sent_today: 0,
        last_sent_date: today,
        warmup_day: newDay,
        warmup_daily_limit: newLimit === -1 ? 999999 : newLimit,
      })
      .eq('organization_id', orgId)
      .eq('domain', domain)

    if (newLimit === -1) {
      return { allowed: true, dailyLimit: -1, sentToday: 0, remaining: -1, warmupDay: newDay, isWarmingUp: false }
    }

    return {
      allowed: true,
      dailyLimit: newLimit,
      sentToday: 0,
      remaining: newLimit,
      warmupDay: newDay,
      isWarmingUp: true,
    }
  }

  const dailyLimit = domainRow.warmup_daily_limit || 200
  const remaining = Math.max(0, dailyLimit - sentToday)

  return {
    allowed: remaining > 0,
    dailyLimit,
    sentToday,
    remaining,
    warmupDay: domainRow.warmup_day || 0,
    isWarmingUp: true,
  }
}

export async function incrementWarmupCounter(orgId: string, fromEmail: string, count: number) {
  const domain = fromEmail.split('@')[1]?.toLowerCase()
  if (!domain) return

  const today = new Date().toISOString().split('T')[0]

  const { data: row } = await supabaseAdmin
    .from('email_domains')
    .select('total_sent_today, warmup_enabled')
    .eq('organization_id', orgId)
    .eq('domain', domain)
    .maybeSingle()

  if (!row?.warmup_enabled) return

  await supabaseAdmin
    .from('email_domains')
    .update({
      total_sent_today: (row.total_sent_today || 0) + count,
      last_sent_date: today,
    })
    .eq('organization_id', orgId)
    .eq('domain', domain)
}
