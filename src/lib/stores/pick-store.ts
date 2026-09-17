// =============================================================
// Qual loja esta requisição quer?
//
// Uma organização tem VÁRIAS lojas. Dezenas de rotas resolviam "a
// loja" com o mesmo bloco copiado: organization_id + is_active,
// ordenado por installed_at, limit 1 — ou seja, a loja ATIVA MAIS
// NOVA. Enquanto a organização tinha uma loja só, funcionava. No dia
// em que a Medicube foi cadastrada, toda rota sem storeId passou a
// sincronizar, instalar webhooks e montar links na Medicube, mesmo
// quando o usuário estava operando a Dr. Groot.
//
// A regra aqui é uma só: a loja pedida (validada contra a organização)
// ou, sem pedido, a ÚNICA loja ativa de verdade. Com duas ou mais,
// não se adivinha — a rota devolve erro pedindo a loja.
// =============================================================

import { hasPlaceholderDomain } from '@/lib/stores/placeholder'

type MinimalClient = { from: (t: string) => any }

export type PickStoreReason =
  /** Veio storeId e ele é de uma das organizações do usuário. */
  | 'requested'
  /** Sem storeId, e a organização tem uma única loja ativa. */
  | 'single'
  /** Sem storeId, e há mais de uma loja ativa — não dá para escolher. */
  | 'ambiguous'
  /** Sem storeId, e nenhuma loja ativa. */
  | 'none'
  /** Veio storeId, mas não existe ou é de outra organização. */
  | 'not_found'

export interface PickStoreResult<T> {
  store: T | null
  reason: PickStoreReason
}

export interface PickStoreOptions {
  /** Organizações do usuário (a padrão + as em que é membro). */
  orgIds: string[]
  /** Loja pedida na query/body, se veio. */
  storeId?: string | null
  /** Colunas a devolver. Padrão '*'. */
  select?: string
  /**
   * Por padrão só lojas ativas contam como "a única". Passe false para
   * rotas de manutenção que precisam alcançar uma loja desconectada
   * pelo id (a busca por id nunca filtra is_active).
   */
  activeOnly?: boolean
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function pickStore<T extends { id: string } = any>(
  supabase: MinimalClient,
  opts: PickStoreOptions
): Promise<PickStoreResult<T>> {
  const orgIds = (opts.orgIds || []).filter(Boolean)
  const select = opts.select || '*'
  if (orgIds.length === 0) return { store: null, reason: 'none' }

  if (opts.storeId) {
    if (!UUID_RE.test(opts.storeId)) return { store: null, reason: 'not_found' }
    const { data } = await supabase
      .from('shopify_stores')
      .select(select)
      .eq('id', opts.storeId)
      .in('organization_id', orgIds)
      .maybeSingle()
    return data ? { store: data as T, reason: 'requested' } : { store: null, reason: 'not_found' }
  }

  // O select precisa de shop_domain e is_active para separar loja de
  // verdade de placeholder; garante as duas sem duplicar quando já vêm.
  const cols = select === '*' ? '*' : Array.from(new Set(
    select.split(',').map((c) => c.trim()).filter(Boolean).concat(['shop_domain', 'is_active'])
  )).join(', ')

  let query = supabase.from('shopify_stores').select(cols).in('organization_id', orgIds)
  if (opts.activeOnly !== false) query = query.eq('is_active', true)
  const { data } = await query
  // Lojas "sem integração" (domínio sintético) não contam: não têm
  // credenciais, catálogo nem domínio para operar.
  const reais = ((data || []) as any[]).filter((s) => !hasPlaceholderDomain(s))
  if (reais.length === 1) return { store: reais[0] as T, reason: 'single' }
  return { store: null, reason: reais.length === 0 ? 'none' : 'ambiguous' }
}

/** Mensagem pronta para a rota devolver quando não há loja escolhida. */
export function pickStoreError(reason: PickStoreReason): { error: string; code: string; status: number } {
  switch (reason) {
    case 'ambiguous':
      return { error: 'A organização tem mais de uma loja. Selecione a loja.', code: 'store_required', status: 400 }
    case 'not_found':
      return { error: 'Loja não encontrada', code: 'store_not_found', status: 404 }
    case 'none':
    default:
      return { error: 'Nenhuma loja conectada', code: 'no_store', status: 404 }
  }
}
