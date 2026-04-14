export async function getEmailDashboardMetrics(supabase: any, orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    const { data: emails } = await supabase.from('email_sends').select('*').eq('organization_id', orgId).gte('created_at', since)
    const total = emails?.length || 0
    const delivered = emails?.filter((e: any) => e.delivered_at).length || 0
    const opened = emails?.filter((e: any) => e.opened_at).length || 0
    const clicked = emails?.filter((e: any) => e.clicked_at).length || 0
    const bounced = emails?.filter((e: any) => e.bounced_at).length || 0
    return {
      emailsSent: total, delivered, opened, clicked, bounced,
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0',
      clickRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : '0',
      bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(1) : '0',
    }
  } catch { return { emailsSent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, openRate: '0', clickRate: '0', bounceRate: '0' } }
}

export async function getEmailsOverTime(supabase: any, orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    const { data: emails } = await supabase.from('email_sends').select('created_at, delivered_at, opened_at, clicked_at').eq('organization_id', orgId).gte('created_at', since)
    const byDay: Record<string, { date: string; sent: number; opened: number; clicked: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 86400000)
      const key = d.toISOString().split('T')[0]
      byDay[key] = { date: key, sent: 0, opened: 0, clicked: 0 }
    }
    emails?.forEach((e: any) => {
      const day = e.created_at?.split('T')[0]
      if (byDay[day]) {
        byDay[day].sent++
        if (e.opened_at) byDay[day].opened++
        if (e.clicked_at) byDay[day].clicked++
      }
    })
    return Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date))
  } catch { return [] }
}

export async function getTopEmailCampaigns(supabase: any, orgId: string, limit = 5) {
  try {
    const { data: campaigns } = await supabase.from('email_campaigns').select('*').eq('organization_id', orgId).order('created_at', { ascending: false }).limit(limit)
    return campaigns || []
  } catch { return [] }
}

// =============================================
// Conversion metrics — revenue per campaign, total attributed revenue
// =============================================
export async function getEmailConversionMetrics(supabase: any, orgId: string, days = 30) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    // Campaigns with their attributed revenue rolled up
    const { data: campaigns } = await supabase
      .from('email_campaigns')
      .select('id, name, subject, status, revenue, conversions, total_sent, total_recipients, opens, clicks, created_at, sent_at')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })

    // Total attributed revenue across all sends (includes automations)
    const { data: sends } = await supabase
      .from('email_sends')
      .select('conversion_value')
      .eq('organization_id', orgId)
      .gte('created_at', since)
      .gt('conversion_value', 0)

    const totalRevenue = (sends || []).reduce(
      (sum: number, s: any) => sum + Number(s.conversion_value || 0),
      0
    )
    const totalConversions = (sends || []).length

    return {
      totalRevenue,
      totalConversions,
      revenuePerRecipient: totalConversions > 0 ? totalRevenue / totalConversions : 0,
      campaigns: (campaigns || []).map((c: any) => ({
        ...c,
        openRate: c.total_sent > 0 ? ((c.opens || 0) / c.total_sent * 100).toFixed(1) : '0',
        clickRate: c.total_sent > 0 ? ((c.clicks || 0) / c.total_sent * 100).toFixed(1) : '0',
        conversionRate: c.total_sent > 0 ? ((c.conversions || 0) / c.total_sent * 100).toFixed(1) : '0',
        revenueFormatted: `R$ ${(c.revenue || 0).toFixed(2)}`,
      })),
    }
  } catch {
    return { totalRevenue: 0, totalConversions: 0, revenuePerRecipient: 0, campaigns: [] }
  }
}
