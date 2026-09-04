// =============================================================
// Remetente no domínio compartilhado da Worder (worder.email)
//
// worder.email é verificado para toda a plataforma: qualquer loja pode
// enviar por ele no dia em que nasce, sem DNS. A parte antes do @ é o
// nome da loja (based@worder.email) e tem de ser única em TODA a
// Worder — hoje há uma "Based"; amanhã pode haver três, em organizações
// diferentes, e cada uma precisa do seu endereço.
//
// A unicidade não é "consultar e torcer": a tabela
// shared_sender_addresses tem chave primária (domain, local_part), então
// duas lojas nascendo ao mesmo tempo não conseguem o mesmo endereço —
// a segunda recebe 23505 e tenta a próxima variação (based-2, based-3…).
//
// Toda loja nasce com um endereço aqui (ensureStoreSharedSender, chamado
// ao criar a loja e, por segurança, sempre que um envio encontra uma
// loja sem remetente). A loja pode trocar pela tela de E-mail &
// Domínios — para outro nome no worder.email (validado e reservado) ou
// para um domínio próprio verificado.
// =============================================================

import { supabaseAdmin } from '@/lib/supabase-admin'

type MinimalClient = { from: (t: string) => any }

/** Domínio compartilhado. Configurável por ambiente; padrão worder.email. */
export function sharedSenderDomain(): string {
  return (process.env.SHARED_SENDER_DOMAIN || 'worder.email').trim().toLowerCase()
}

export function isSharedDomainEmail(email: string | null | undefined): boolean {
  if (!email) return false
  const at = String(email).lastIndexOf('@')
  if (at < 0) return false
  return String(email).slice(at + 1).toLowerCase() === sharedSenderDomain()
}

export function localPartOf(email: string): string {
  const at = String(email).lastIndexOf('@')
  return at < 0 ? '' : String(email).slice(0, at).toLowerCase()
}

const LOCAL_PART_RE = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/

/** A parte antes do @ é válida? Minúsculas, dígitos, ponto, hífen e underscore. */
export function isValidLocalPart(local: string): boolean {
  return LOCAL_PART_RE.test(local)
}

/**
 * Nome da loja → parte antes do @.
 *   "Dr. Groot"        → dr-groot
 *   "Based"            → based
 *   "Loja da Ana ❤️"   → loja-da-ana
 *   ""                 → loja
 */
export function slugifyLocalPart(name: string | null | undefined): string {
  const base = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/g, '')
  return base || 'loja'
}

export interface Availability {
  available: boolean
  /** Loja que já usa este nome (quando não disponível). */
  ownerStoreId?: string | null
  /** Primeira variação livre quando o nome pedido está em uso. */
  suggestion?: string
}

async function ownerOf(supabase: MinimalClient, local: string): Promise<string | null> {
  const { data } = await supabase
    .from('shared_sender_addresses')
    .select('store_id')
    .eq('domain', sharedSenderDomain())
    .eq('local_part', local)
    .maybeSingle()
  return data?.store_id || null
}

/** Variações na ordem em que são tentadas: nome, nome-2, nome-3, … */
export function variations(base: string, max = 50): string[] {
  const out = [base]
  for (let i = 2; i <= max; i++) out.push(`${base}-${i}`)
  return out
}

/**
 * Este nome está livre para esta loja? Livre também quando a reserva já
 * é da própria loja (renomear para o que já se tem não é conflito).
 */
export async function checkLocalPartAvailability(
  local: string,
  storeId: string | null,
  supabase: MinimalClient = supabaseAdmin
): Promise<Availability> {
  const clean = String(local || '').toLowerCase().trim()
  if (!isValidLocalPart(clean)) return { available: false, suggestion: slugifyLocalPart(clean) }
  const owner = await ownerOf(supabase, clean)
  if (!owner || (storeId && owner === storeId)) return { available: true }
  // Procura a primeira variação livre para sugerir.
  for (const candidate of variations(clean).slice(1)) {
    const o = await ownerOf(supabase, candidate)
    if (!o || (storeId && o === storeId)) return { available: false, ownerStoreId: owner, suggestion: candidate }
  }
  return { available: false, ownerStoreId: owner }
}

/**
 * Reserva o nome para a loja. Devolve false quando outra loja já o tem.
 * A chave primária faz o trabalho: sem janela entre "consultar" e
 * "gravar".
 */
export async function reserveLocalPart(
  local: string,
  storeId: string,
  organizationId: string | null,
  supabase: MinimalClient = supabaseAdmin
): Promise<boolean> {
  const clean = String(local || '').toLowerCase().trim()
  if (!isValidLocalPart(clean)) return false
  const { error } = await supabase
    .from('shared_sender_addresses')
    .insert({ domain: sharedSenderDomain(), local_part: clean, store_id: storeId, organization_id: organizationId })
  if (!error) return true
  if (error.code === '23505') {
    // Já existe: é nosso?
    return (await ownerOf(supabase, clean)) === storeId
  }
  throw new Error(error.message || 'Falha ao reservar endereço')
}

/** Libera as reservas da loja, exceto a que ela está usando agora. */
export async function releaseOtherLocalParts(
  storeId: string,
  keepLocal: string | null,
  supabase: MinimalClient = supabaseAdmin
): Promise<void> {
  let q = supabase.from('shared_sender_addresses').delete().eq('store_id', storeId)
  if (keepLocal) q = q.neq('local_part', keepLocal)
  await q
}

/**
 * Aloca um endereço livre para a loja a partir do nome dela: based,
 * based-2, based-3… Devolve a parte antes do @.
 */
export async function allocateLocalPart(
  storeId: string,
  organizationId: string | null,
  shopName: string | null | undefined,
  supabase: MinimalClient = supabaseAdmin
): Promise<string> {
  const base = slugifyLocalPart(shopName)
  for (const candidate of variations(base)) {
    if (await reserveLocalPart(candidate, storeId, organizationId, supabase)) return candidate
  }
  // Cinquenta lojas com o mesmo nome: acrescenta um sufixo aleatório.
  for (let i = 0; i < 5; i++) {
    const candidate = `${base}-${Math.random().toString(36).slice(2, 6)}`
    if (await reserveLocalPart(candidate, storeId, organizationId, supabase)) return candidate
  }
  throw new Error(`Não foi possível reservar um endereço para "${shopName}" em ${sharedSenderDomain()}`)
}

export interface StoreEmailSettings {
  default_sender_name?: string
  default_sender_email?: string
  default_reply_to?: string
  tracking_domain?: string
  [k: string]: any
}

/**
 * Garante que a loja tem remetente. Sem nenhum, aloca
 * <nome-da-loja>@worder.email, grava em settings.email_settings e
 * devolve as configurações. Idempotente: com remetente já definido, só
 * garante a reserva (quando é do domínio compartilhado) e devolve.
 */
export async function ensureStoreSharedSender(
  storeId: string,
  supabase: MinimalClient = supabaseAdmin
): Promise<{ settings: StoreEmailSettings; allocated: boolean } | null> {
  const { data: store } = await supabase
    .from('shopify_stores')
    .select('id, organization_id, shop_name, shop_email, settings')
    .eq('id', storeId)
    .maybeSingle()
  if (!store) return null

  const prev: Record<string, any> = (store.settings as any) || {}
  const current: StoreEmailSettings = { ...(prev.email_settings || {}) }

  if (current.default_sender_email) {
    // Já tem. Se for do domínio compartilhado, garante a reserva —
    // endereços criados antes desta tabela existir entram aqui.
    if (isSharedDomainEmail(current.default_sender_email)) {
      try { await reserveLocalPart(localPartOf(current.default_sender_email), store.id, store.organization_id, supabase) } catch { /* melhor esforço */ }
    }
    return { settings: current, allocated: false }
  }

  const local = await allocateLocalPart(store.id, store.organization_id, store.shop_name, supabase)
  const email = `${local}@${sharedSenderDomain()}`
  const next: StoreEmailSettings = {
    ...current,
    default_sender_name: current.default_sender_name || store.shop_name || 'Loja',
    default_sender_email: email,
    default_reply_to: current.default_reply_to || store.shop_email || email,
  }
  const merged = { ...prev, email_settings: next }
  const { error } = await supabase
    .from('shopify_stores')
    .update({ settings: merged, updated_at: new Date().toISOString() })
    .eq('id', store.id)
  if (error) throw new Error(error.message)
  return { settings: next, allocated: true }
}
