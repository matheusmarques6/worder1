// Dinheiro da aba IA no formato do protótipo: "R$ 18.420", "R$ 0,04".
// Os custos de LLM chegam em US$ (internal.llm_calls, ai_usage_logs); a
// tela mostra R$ pela cotação USD→BRL mais recente de exchange_rates, com
// 5,00 de reserva quando a tabela não tem a cotação.

import type { SupabaseClient } from '@supabase/supabase-js'

export const USD_BRL_FALLBACK = 5

/** Igual ao `brl` do protótipo: "R$ " + número pt-BR com `d` casas. */
export function brl(value: number | null | undefined, d = 2): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return 'R$ ' + n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** Número pt-BR sem moeda ("1.284", "97,8"). */
export function num(value: number | null | undefined, d = 0): string {
  const n = typeof value === 'number' && Number.isFinite(value) ? value : 0
  return n.toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d })
}

/** Percentual a partir de uma fração (0,978 → "97,8%"). null vira "—". */
export function pct(fraction: number | null | undefined, d = 0): string {
  if (fraction === null || fraction === undefined || !Number.isFinite(fraction)) return '—'
  return num(fraction * 100, d) + '%'
}

/** Cotação USD→BRL mais recente; reserva quando não há linha ou dá erro. */
export async function usdToBrlRate(supabase: SupabaseClient): Promise<number> {
  try {
    const { data } = await supabase
      .from('exchange_rates')
      .select('rate')
      .eq('from_currency', 'USD')
      .eq('to_currency', 'BRL')
      .order('date', { ascending: false })
      .limit(1)
      .maybeSingle()
    const rate = Number((data as { rate?: unknown } | null)?.rate)
    return Number.isFinite(rate) && rate > 0 ? rate : USD_BRL_FALLBACK
  } catch {
    return USD_BRL_FALLBACK
  }
}

export function usdToBrl(usd: number | null | undefined, rate: number): number | null {
  if (usd === null || usd === undefined || !Number.isFinite(usd)) return null
  return Math.round(usd * rate * 10000) / 10000
}
