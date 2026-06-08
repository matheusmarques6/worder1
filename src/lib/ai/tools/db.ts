// =====================================================
// WRAPPER RLS PARA HANDLERS DE TOOLS (Fase 2b / §8 do plano)
// =====================================================
// supabaseAdmin (service role) FURA o RLS do Postgres. Para evitar vazamento
// cross-tenant (classe de bug do audit anterior), TODO handler de tool deve
// consultar dados SOMENTE através destes helpers, que injetam e asseguram o
// `organization_id` em cada query. Não confiar em convenção: em dev
// (NODE_ENV !== 'production') lançamos erro claro se um handler tentar uma
// query sem organizationId.

import { supabaseAdmin } from '@/lib/supabase-admin'

const ORG_COLUMN = 'organization_id'

/**
 * Sanitiza um valor de input (LLM/cliente) para uso seguro DENTRO de um filtro
 * `.or('col.ilike.%<valor>%, ...')` do PostgREST. Na sintaxe do PostgREST a
 * vírgula separa condições OR e os parênteses agrupam — então um valor cru com
 * `,` `(` `)` `"` `\` pode alterar a ESTRUTURA do filtro (injeção de filtro:
 * quebra a query ou força condições extras como status.eq.draft). Aqui:
 *  1) removemos os caracteres estruturais do PostgREST;
 *  2) escapamos os wildcards de ILIKE (`%` `_`) para tratá-los como literais.
 * Não removemos `.` nem `@` (necessários p/ e-mails). O escopo (store_id/org)
 * é sempre um `.eq()` separado em AND, então isto não afeta o multi-tenant —
 * trata-se de robustez/abuso de filtro dentro do escopo já validado.
 */
export function sanitizeOrValue(value: string): string {
  return (value || '')
    .replace(/[,()"\\]/g, ' ')
    .replace(/[%_]/g, (m) => `\\${m}`)
    .trim()
}

function assertOrg(organizationId: string | undefined | null, op: string): string {
  if (!organizationId || typeof organizationId !== 'string' || !organizationId.trim()) {
    const msg =
      `[tools/db] ${op} chamado sem organizationId — bloqueado para evitar ` +
      `vazamento cross-tenant. Todo handler de tool deve passar ctx.organizationId.`
    // Em dev/test estoura para pegar o bug cedo; em prod loga e estoura também
    // (preferimos falhar a vazar). Mantemos throw nos dois ambientes.
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(msg)
    }
    console.error(msg)
    throw new Error('tools/db: organizationId ausente')
  }
  return organizationId
}

/**
 * SELECT com escopo de org: retorna um query builder já com
 * `.eq('organization_id', organizationId)` aplicado. Encadeie filtros/orders
 * normalmente.
 *
 * Ex.: const { data } = await orgSelect('contacts', orgId, 'id, phone').eq('phone', p)
 */
export function orgSelect(
  table: string,
  organizationId: string,
  columns = '*',
  options?: { count?: 'exact' | 'planned' | 'estimated'; head?: boolean },
) {
  const org = assertOrg(organizationId, `orgSelect('${table}')`)
  return supabaseAdmin.from(table).select(columns, options).eq(ORG_COLUMN, org)
}

/**
 * Builder genérico já escopado por org (para casos em que se quer chamar
 * .insert/.update/.delete manualmente porém com a garantia da asserção).
 * Use os helpers específicos abaixo sempre que possível.
 */
export function orgScopedFrom(table: string, organizationId: string) {
  const org = assertOrg(organizationId, `orgScopedFrom('${table}')`)
  // Devolvemos um objeto fino que sempre re-aplica o filtro/coluna de org.
  return {
    select: (columns = '*', options?: any) =>
      supabaseAdmin.from(table).select(columns, options).eq(ORG_COLUMN, org),
    update: (values: Record<string, any>) =>
      supabaseAdmin.from(table).update(values).eq(ORG_COLUMN, org),
    delete: () => supabaseAdmin.from(table).delete().eq(ORG_COLUMN, org),
  }
}

/**
 * INSERT garantindo organization_id em cada linha.
 */
export function orgInsert(
  table: string,
  organizationId: string,
  values: Record<string, any> | Record<string, any>[],
) {
  const org = assertOrg(organizationId, `orgInsert('${table}')`)
  const withOrg = Array.isArray(values)
    ? values.map((v) => ({ ...v, [ORG_COLUMN]: org }))
    : { ...values, [ORG_COLUMN]: org }
  return supabaseAdmin.from(table).insert(withOrg)
}

/**
 * UPDATE escopado por org: já aplica `.eq('organization_id', organizationId)`.
 * Encadeie filtros adicionais (.eq('id', ...)) antes de await.
 */
export function orgUpdate(
  table: string,
  organizationId: string,
  values: Record<string, any>,
) {
  const org = assertOrg(organizationId, `orgUpdate('${table}')`)
  return supabaseAdmin.from(table).update(values).eq(ORG_COLUMN, org)
}

/**
 * SELECT escopado por LOJA para tabelas Shopify (`shopify_products`,
 * `shopify_orders`) que NÃO possuem coluna `organization_id` — elas são
 * escopadas por `store_id` (FK -> shopify_stores, que por sua vez tem
 * organization_id). Para não furar o isolamento multi-tenant, esta função
 * PRIMEIRO valida que a loja (storeId) pertence à organização via
 * `shopify_stores` (org-scoped por orgSelect) e SÓ ENTÃO devolve um query
 * builder filtrado por `store_id`. Se a loja não pertencer à org (ou não
 * existir), retorna `{ builder: null }` e o handler deve abortar.
 *
 * Ex.:
 *   const { builder, error } = await orgStoreSelect('shopify_products', orgId, storeId, 'id, title')
 *   if (!builder) return { ok:false, error }
 *   const { data } = await builder.ilike('title', `%${q}%`).limit(5)
 */
export async function orgStoreSelect(
  table: 'shopify_products' | 'shopify_orders',
  organizationId: string,
  storeId: string | undefined | null,
  columns = '*',
): Promise<{ builder: any; error?: string }> {
  const org = assertOrg(organizationId, `orgStoreSelect('${table}')`)
  const sid = (storeId || '').trim()
  if (!sid) {
    return { builder: null, error: 'no_store' }
  }
  // Validar que a loja pertence à org (shopify_stores TEM organization_id).
  const { data: store, error: storeErr } = await orgSelect('shopify_stores', org, 'id')
    .eq('id', sid)
    .maybeSingle()
  if (storeErr) {
    return { builder: null, error: storeErr.message }
  }
  if (!store) {
    // Loja inexistente ou de outra org — não vazar dados.
    return { builder: null, error: 'store_not_in_org' }
  }
  return {
    builder: supabaseAdmin.from(table).select(columns).eq('store_id', sid),
  }
}

/**
 * UPSERT garantindo organization_id. `onConflict` deve incluir
 * organization_id quando houver constraint composta.
 */
export function orgUpsert(
  table: string,
  organizationId: string,
  values: Record<string, any> | Record<string, any>[],
  options?: { onConflict?: string; ignoreDuplicates?: boolean },
) {
  const org = assertOrg(organizationId, `orgUpsert('${table}')`)
  const withOrg = Array.isArray(values)
    ? values.map((v) => ({ ...v, [ORG_COLUMN]: org }))
    : { ...values, [ORG_COLUMN]: org }
  return supabaseAdmin.from(table).upsert(withOrg, options)
}
