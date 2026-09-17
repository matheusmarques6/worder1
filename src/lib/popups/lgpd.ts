// =============================================
// LGPD para os dados de popup.
//
// Um pedido de titular (Art. 18) tem de alcançar TUDO que o popup guardou
// daquela pessoa, não só a ficha do contato:
//
//   crm_form_submissions  respostas digitadas (e-mail, telefone, quiz),
//                         IP, user agent, página, cupom entregue
//   consent_records       a prova do consentimento: texto exibido, versão,
//                         canal, quando
//   incentive_grants      o cupom emitido e o que aconteceu com ele
//   visitor_identities    o rastro anônimo do navegador, ligado à pessoa
//   whatsapp_opt_status   o telefone e a evidência do opt-in
//
// Na EXCLUSÃO a régua não é "apagar tudo": é remover o que identifica e
// preservar o que a lei manda o controlador conseguir provar. Por isso o
// registro de consentimento sobrevive sem IP nem user agent — o texto que
// a pessoa leu e a data continuam lá (Art. 8º §2º, ônus da prova é do
// controlador), enquanto as respostas do formulário, que são só dela,
// somem por completo.
//
// Tudo aqui é escopado por organização E contato: um pedido nunca alcança
// a linha de outro cliente.
// =============================================

import type { SupabaseClient } from '@supabase/supabase-js'

export interface PopupDataExport {
  submissions: any[]
  consents: any[]
  coupons: any[]
  visitors: any[]
  whatsapp: any[]
}

export interface PopupEraseReport {
  submissions: number
  consents: number
  visitors: number
  whatsapp: number
}

/** O que o popup guardou desta pessoa, em formato legível. */
export async function exportPopupData(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<PopupDataExport> {
  const [subs, consents, grants, visitors, whats] = await Promise.all([
    admin
      .from('crm_form_submissions')
      .select('id, created_at, answers, page_url, device, country, traffic_type, page_kind, coupon_code, coupon_kind, reward_tier, game_prize, converted_at, conversion_value, form:crm_forms(name)')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('consent_records')
      .select('channel, action, source, consent_text, consent_version, page_url, occurred_at')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('occurred_at', { ascending: false })
      .limit(500),
    admin
      .from('incentive_grants')
      .select('coupon_code, kind, value, status, validity_until, created_at, tier_key')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .order('created_at', { ascending: false })
      .limit(500),
    admin
      .from('visitor_identities')
      .select('worder_visitor_id, first_seen_at, last_seen_at, match_source')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .limit(100),
    admin
      .from('whatsapp_opt_status')
      .select('status, opted_in_at, opted_out_at, opt_in_source')
      .eq('organization_id', orgId)
      .eq('contact_id', contactId)
      .limit(50),
  ])

  return {
    submissions: (subs.data || []).map((s: any) => ({
      ...s,
      popup: Array.isArray(s.form) ? s.form[0]?.name : s.form?.name,
      form: undefined,
    })),
    consents: consents.data || [],
    coupons: grants.data || [],
    visitors: visitors.data || [],
    whatsapp: whats.data || [],
  }
}

/**
 * Tira desta pessoa tudo o que a identifica dentro do popup, mantendo o
 * que é registro da loja (quantas inscrições, receita atribuída) e a prova
 * do consentimento sem os identificadores.
 */
export async function erasePopupData(
  admin: SupabaseClient,
  orgId: string,
  contactId: string,
): Promise<PopupEraseReport> {
  const now = new Date().toISOString()
  const report: PopupEraseReport = { submissions: 0, consents: 0, visitors: 0, whatsapp: 0 }

  // 1. Respostas do formulário: é o que a pessoa digitou. Sai inteiro.
  //    O restante da linha (data, popup, cupom, conversão) fica: são os
  //    números da loja, e sem as respostas já não identificam ninguém.
  const { data: subs } = await admin
    .from('crm_form_submissions')
    .update({
      answers: {},
      ip_address: null,
      user_agent: null,
      referrer: null,
      page_url: null,
      visitor_id: null,
      session_id: null,
    })
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .select('id')
  report.submissions = (subs || []).length

  // 2. Prova do consentimento: fica, sem IP nem user agent. É o que
  //    responde "essa pessoa aceitou receber, lendo este texto, nesta data".
  const { data: cons } = await admin
    .from('consent_records')
    .update({ ip_address: null, user_agent: null, page_url: null })
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .select('id')
  report.consents = (cons || []).length

  // 3. Rastro do navegador: desliga da pessoa e limpa o que era dela.
  const { data: vis } = await admin
    .from('visitor_identities')
    .update({
      contact_id: null,
      last_email: null,
      last_ip: null,
      last_user_agent: null,
      email_hash: null,
      phone_hash: null,
      shopify_customer_id: null,
      updated_at: now,
    })
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .select('id')
  report.visitors = (vis || []).length

  // 4. WhatsApp: o número e a evidência saem. A linha fica como registro
  //    de que houve opt-out, para nunca voltar a ser alvo de campanha.
  const { data: wa } = await admin
    .from('whatsapp_opt_status')
    .update({
      phone: null,
      consent_evidence: {},
      status: 'opted_out',
      opted_out_at: now,
      opt_out_reason: 'lgpd_erasure',
      updated_at: now,
    })
    .eq('organization_id', orgId)
    .eq('contact_id', contactId)
    .select('id')
  report.whatsapp = (wa || []).length

  return report
}
