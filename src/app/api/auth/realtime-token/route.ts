export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'
import { supabaseAdmin } from '@/lib/supabase-admin'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

/**
 * Decodifica o claim `exp` (epoch seconds, padrao JWT) do access token,
 * sem validar assinatura — so pra saber quando expira. Retorna undefined
 * se o token nao for um JWT bem formado (nunca lanca).
 */
function decodeExpiry(token: string): number | undefined {
  try {
    const payload = token.split('.')[1]
    if (!payload) return undefined
    const json = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'))
    return typeof json?.exp === 'number' ? json.exp : undefined
  } catch {
    return undefined
  }
}

/**
 * Devolve o access token do PROPRIO usuario autenticado.
 *
 * Por que existe: o login grava `sb-access-token` como cookie httpOnly
 * (JS nao le), e o client Supabase do browser (`supabase-client.ts`) e
 * anon sem sessao. Realtime postgres_changes respeita RLS: sem JWT, as
 * policies das tabelas whatsapp_cloud_* negam tudo e nenhum evento chega.
 * O hook useCloudInboxRealtime chama este endpoint e repassa o token para
 * supabaseClient.realtime.setAuth().
 *
 * (Este comentario dizia "as policies *_org_select ... via
 * auth.organization_id()". Nao dizia a verdade: aquela funcao nao existe
 * em producao e nenhuma policy de 001_enable_rls.sql chegou a ser criada.
 * O que existe nessas tabelas veio de outro lugar e ainda nao foi
 * auditado — supabase/audits/2026-07-30_rls_realtime_audit.sql.)
 *
 * Seguranca: same-origin + autenticado. `requireOrgFromAuth` aceita 2
 * fontes (Authorization header OU cookie) para resolver a org — mas
 * este endpoint so pode devolver o token que estiver no cookie
 * `sb-access-token` (e o unico que o browser vai usar em
 * supabaseClient.realtime.setAuth()). Por isso o cookie e validado aqui
 * de novo, independente do path que `requireOrgFromAuth` tomou: num
 * caminho misto (Authorization valido + cookie presente), o cookie
 * pode estar velho/invalido e nunca teria sido checado pelo helper.
 * Nunca devolve um token que nao foi validado nesta chamada.
 */
export async function GET(request: NextRequest) {
  const auth = await requireOrgFromAuth(request)
  if (auth instanceof NextResponse) return auth

  const token = request.cookies.get('sb-access-token')?.value
  if (!token || token === 'dev-access-token') {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS },
    )
  }

  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token)
  if (error || !user) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401, headers: NO_CACHE_HEADERS },
    )
  }

  const expiresAt = decodeExpiry(token)
  const body: { token: string; expiresAt?: number } = { token }
  if (expiresAt !== undefined) body.expiresAt = expiresAt

  return NextResponse.json(body, { headers: NO_CACHE_HEADERS })
}
