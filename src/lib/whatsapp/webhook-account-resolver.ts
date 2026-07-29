// =============================================
// Resolucao da conta (WABA) a partir do envelope do webhook da Meta.
//
// Extraido de webhook-processor.ts porque a regra e sutil e erra em silencio:
// quando nenhuma linha casa, o processador apenas conta um `skipped`, devolve
// 200 pra Meta (que entao NAO faz retry) e a mensagem do cliente evapora.
//
// O que precisa ser verdade ao mesmo tempo:
//   1. Nao vazar cross-tenant. phone_number_id sozinho nao basta: o UNIQUE do
//      banco e (organization_id, phone_number_id), entao duas orgs podem ter a
//      mesma linha. entry.id (o WABA ID, globalmente unico na Meta) desempata.
//   2. Nao descartar linha legada. waba_id e NULL em linhas antigas — a propria
//      migration 20260607 diz isso ("waba_id pode ser NULL em rows legadas") e
//      o UNIQUE de waba_id e parcial (WHERE waba_id IS NOT NULL).
//
// O lookup antigo fazia `.eq('waba_id', entryWabaId)` direto, o que satisfazia
// (1) e violava (2): em SQL, `waba_id = '123'` e FALSE para linha com NULL.
// O comentario no codigo afirmava o contrario do que o codigo fazia.
//
// A filtragem acontece aqui, em TS, e nao no PostgREST, de proposito: montar
// `.or('waba_id.eq.' + entryWabaId + ',waba_id.is.null')` interpolaria um valor
// vindo do payload dentro de uma string de filtro. O payload e verificado por
// HMAC, mas nao ha razao para criar essa superficie quando a alternativa e
// filtrar em memoria sobre um punhado de linhas.
// =============================================

export type WebhookAccountMatch = 'waba_id' | 'legacy_null_waba' | 'phone_number_id';

// `ok` e o discriminante explicito: com `account: T` generico, TS nao consegue
// estreitar a uniao so por `!resolution.account`.
export type WebhookAccountResolution<T = any> =
  | { ok: true; account: T; matchedBy: WebhookAccountMatch }
  | { ok: false; account: null; reason: 'not_found' | 'ambiguous'; candidates: number };

/**
 * Escolhe a conta certa entre as linhas que casam com o phone_number_id.
 *
 * `rows` deve ser o resultado de um filtro por phone_number_id apenas — a
 * decisao sobre waba_id e toda aqui.
 */
export function resolveWebhookAccount<T extends { waba_id?: string | null }>(
  rows: T[] | null | undefined,
  entryWabaId?: string | null,
): WebhookAccountResolution<T> {
  const candidates = rows ?? [];

  if (candidates.length === 0) {
    return { ok: false, account: null, reason: 'not_found', candidates: 0 };
  }

  // Sem entry.id no envelope: cai no comportamento pre-multi-tenant. Uma linha
  // resolve; mais de uma e ambiguo e chutar seria vazamento.
  if (!entryWabaId) {
    if (candidates.length === 1) {
      return { ok: true, account: candidates[0], matchedBy: 'phone_number_id' };
    }
    return { ok: false, account: null, reason: 'ambiguous', candidates: candidates.length };
  }

  // Match exato ganha sempre. O UNIQUE parcial garante no maximo 1 — se vier
  // mais, o banco esta corrompido e chutar seria pior que pular.
  const exact = candidates.filter(
    (r) => r.waba_id != null && String(r.waba_id) === String(entryWabaId),
  );
  if (exact.length === 1) {
    return { ok: true, account: exact[0], matchedBy: 'waba_id' };
  }
  if (exact.length > 1) {
    return { ok: false, account: null, reason: 'ambiguous', candidates: exact.length };
  }

  // Nenhum match exato. Linhas com waba_id NULL sao candidatas legadas: nao
  // contradizem o entry.id, so nao o conhecem. Linhas com waba_id DIFERENTE
  // ficam de fora — sao de outro WABA e casar com elas e o vazamento que a
  // migration 20260607 foi criada para impedir.
  const legacy = candidates.filter((r) => r.waba_id == null);
  if (legacy.length === 1) {
    return { ok: true, account: legacy[0], matchedBy: 'legacy_null_waba' };
  }
  if (legacy.length > 1) {
    return { ok: false, account: null, reason: 'ambiguous', candidates: legacy.length };
  }

  return { ok: false, account: null, reason: 'not_found', candidates: candidates.length };
}
