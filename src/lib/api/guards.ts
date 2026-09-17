// =============================================================
// As cercas que faltavam nas rotas que recebem um id pela URL.
//
// O problema é sempre o mesmo. A rota lê um id — de loja, de campanha,
// de modelo — e vai ao banco com a chave de serviço, que ignora RLS.
// Sem sessão e sem conferir dono, o id sozinho abre a linha: quem
// soubesse (ou adivinhasse) um id lia e escrevia em dados de outra
// organização. Nas rotas de análise da Shopify era pior ainda, porque
// elas carregam o `access_token` da loja e chamam a API da Shopify com
// ele — um id alheio bastava para operar a loja alheia.
//
// `requireStore` exige sessão e confirma que a loja é da organização de
// quem pediu (ou de uma de que a pessoa é membro). Para as demais
// tabelas o mínimo equivalente já existia: `requireOrgFromAuth`, em
// `@/lib/auth/require-org`.
// =============================================================

import { NextRequest, NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthClient, getSupabaseClient, validateStoreAccess } from '@/lib/api-utils'

export type StoreGuardOk = {
  ok: true
  storeId: string
  /** Organização dona da loja — nem sempre a do perfil, ver validateStoreAccess. */
  organizationId: string
  /** Organização do perfil de quem pediu. */
  userOrganizationId: string
  userId: string
  /** Cliente de serviço, já liberado para esta loja. */
  supabase: SupabaseClient
}

export type StoreGuardFail = { ok: false; response: NextResponse }

/**
 * Lê a loja de `?storeId=` (ou `?store_id=`), exige sessão e confere o
 * dono. Aceita um id explícito para as rotas que o tiram do corpo.
 */
export async function requireStore(
  request: NextRequest,
  explicitStoreId?: string | null
): Promise<StoreGuardOk | StoreGuardFail> {
  const storeId =
    explicitStoreId ||
    request.nextUrl.searchParams.get('storeId') ||
    request.nextUrl.searchParams.get('store_id')

  if (!storeId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'storeId é obrigatório' }, { status: 400 }),
    }
  }

  const auth = await getAuthClient()
  if (!auth) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Não autenticado' }, { status: 401 }),
    }
  }

  const supabase = getSupabaseClient()
  if (!supabase) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Banco não configurado' }, { status: 503 }),
    }
  }

  const check = await validateStoreAccess(
    supabase,
    auth.user.organization_id,
    storeId,
    auth.user.id
  )
  if (!check.valid) {
    // 404 quando a loja não existe, 403 quando existe e é de outra
    // organização: nada aqui revela a existência de loja alheia além do
    // que validateStoreAccess já decidiu.
    return {
      ok: false,
      response: NextResponse.json(
        { error: check.error || 'Sem acesso a esta loja' },
        { status: check.status || 403 }
      ),
    }
  }

  return {
    ok: true,
    storeId,
    organizationId: check.storeOrganizationId || auth.user.organization_id,
    userOrganizationId: auth.user.organization_id,
    userId: auth.user.id,
    supabase,
  }
}


/**
 * Ids das lojas de uma organização.
 *
 * Parte do CRM — deals, pipelines, pipeline_stages, deal_activities,
 * events — não tem coluna de organização: a cerca dessas tabelas passa
 * por `store_id`. Esta função dá a lista para o `.in('store_id', …)`.
 * Devolve lista vazia quando a organização não tem loja, e quem chama
 * deve tratar isso como "nada a mostrar", nunca como "sem filtro".
 */
export async function orgStoreIds(
  supabase: SupabaseClient,
  organizationId: string
): Promise<string[]> {
  const { data } = await supabase
    .from('shopify_stores')
    .select('id')
    .eq('organization_id', organizationId)
  return (data || []).map((s: any) => s.id).filter(Boolean)
}
