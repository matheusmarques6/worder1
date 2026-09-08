// =============================================================
// Números do painel de e-mail.
//
// Duas regras que faltavam aqui e faziam o painel mentir:
//
// 1. A LOJA. Uma organização tem várias lojas, e a tela de análise
//    manda a loja selecionada. Estas funções ignoravam esse recorte e
//    somavam tudo: quem olhava os números da Dr. Groot via também os da
//    Medicube, sem nada indicando a mistura.
//
// 2. O TETO DE LINHAS. `select('*')` sem paginar volta no máximo mil
//    linhas pelo PostgREST. Passando disso, o painel descrevia uma
//    fatia do período com cara de total — e ficava mais errado a cada
//    envio novo, que é a pior forma de estar errado.
// =============================================================

const PAGE = 1000
const MAX_PAGES = 100

/**
 * Lê tudo o que a consulta seleciona, página por página. `build` é
 * chamada a cada página porque um builder do PostgREST não pode ser
 * reaproveitado depois de aguardado.
 */
async function readAll<T = any>(build: () => any): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE
    const { data, error } = await build().range(from, from + PAGE - 1)
    if (error) break
    const rows = (data || []) as T[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

/** Aplica o recorte de loja quando a tela mandou uma. */
function scoped(query: any, storeId?: string | null) {
  return storeId ? query.eq('store_id', storeId) : query
}

export async function getEmailDashboardMetrics(
  supabase: any,
  orgId: string,
  days = 30,
  storeId?: string | null
) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    const emails = await readAll(() =>
      scoped(
        supabase
          .from('email_sends')
          .select('delivered_at, opened_at, clicked_at, bounced_at')
          .eq('organization_id', orgId)
          .gte('created_at', since),
        storeId
      )
    )
    const total = emails.length
    const delivered = emails.filter((e: any) => e.delivered_at).length
    const opened = emails.filter((e: any) => e.opened_at).length
    const clicked = emails.filter((e: any) => e.clicked_at).length
    const bounced = emails.filter((e: any) => e.bounced_at).length
    return {
      emailsSent: total, delivered, opened, clicked, bounced,
      openRate: delivered > 0 ? ((opened / delivered) * 100).toFixed(1) : '0',
      clickRate: delivered > 0 ? ((clicked / delivered) * 100).toFixed(1) : '0',
      bounceRate: total > 0 ? ((bounced / total) * 100).toFixed(1) : '0',
    }
  } catch {
    return { emailsSent: 0, delivered: 0, opened: 0, clicked: 0, bounced: 0, openRate: '0', clickRate: '0', bounceRate: '0' }
  }
}

export async function getEmailsOverTime(
  supabase: any,
  orgId: string,
  days = 30,
  storeId?: string | null
) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    const emails = await readAll(() =>
      scoped(
        supabase
          .from('email_sends')
          .select('created_at, delivered_at, opened_at, clicked_at')
          .eq('organization_id', orgId)
          .gte('created_at', since),
        storeId
      )
    )
    const byDay: Record<string, { date: string; sent: number; opened: number; clicked: number }> = {}
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.now() - i * 86400000)
      const key = d.toISOString().split('T')[0]
      byDay[key] = { date: key, sent: 0, opened: 0, clicked: 0 }
    }
    emails.forEach((e: any) => {
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

export async function getTopEmailCampaigns(
  supabase: any,
  orgId: string,
  limit = 5,
  storeId?: string | null
) {
  try {
    const { data: campaigns } = await scoped(
      supabase.from('email_campaigns').select('*').eq('organization_id', orgId),
      storeId
    ).order('created_at', { ascending: false }).limit(limit)
    return campaigns || []
  } catch { return [] }
}

// =============================================
// Conversão — receita atribuída por campanha e no total
// =============================================
export async function getEmailConversionMetrics(
  supabase: any,
  orgId: string,
  days = 30,
  storeId?: string | null
) {
  const since = new Date(Date.now() - days * 86400000).toISOString()
  try {
    const { data: campaigns } = await scoped(
      supabase
        .from('email_campaigns')
        .select('id, name, subject, status, revenue, conversions, total_sent, total_recipients, opens, clicks, created_at, sent_at')
        .eq('organization_id', orgId)
        .gte('created_at', since),
      storeId
    ).order('created_at', { ascending: false })

    // Receita atribuída em todos os envios do período, automações
    // incluídas. Paginado: são as linhas com conversão, mas nada impede
    // que passem de mil num mês bom.
    const sends = await readAll(() =>
      scoped(
        supabase
          .from('email_sends')
          .select('conversion_value')
          .eq('organization_id', orgId)
          .gte('created_at', since)
          .gt('conversion_value', 0),
        storeId
      )
    )

    const totalRevenue = sends.reduce(
      (sum: number, s: any) => sum + Number(s.conversion_value || 0),
      0
    )
    const totalConversions = sends.length

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
