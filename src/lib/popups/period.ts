// =============================================
// Janela "últimos N dias" no fuso do lojista.
//
// Lista, analytics e exportação precisam contar os MESMOS dias: N dias
// de calendário a partir da meia-noite local, não N×24h a partir de
// agora em UTC. É a mesma regra do popup_daily_stats/popup_forms_summary
// (p_tz) no banco.
// =============================================

const TZ_RE = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+){0,3}$/

/** Fuso IANA válido ou o padrão. */
export function safeTz(raw: string | null | undefined, fallback = 'America/Sao_Paulo'): string {
  const tz = String(raw || '')
  if (!tz || tz.length > 64 || !TZ_RE.test(tz)) return fallback
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return tz } catch { return fallback }
}

/** Meia-noite local de (hoje − (days − 1)) no fuso, em UTC. */
export function startOfDayInTz(days: number, tz: string): Date {
  try {
    const now = new Date()
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
    const localMidnightUtc = Date.UTC(get('year'), get('month') - 1, get('day'))
    // Diferença entre o "agora" local e o UTC diz o offset do fuso.
    const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz })).getTime()
    const offset = localNow - now.getTime()
    return new Date(localMidnightUtc - offset - (days - 1) * 86400000)
  } catch {
    return new Date(Date.now() - days * 86400000)
  }
}
