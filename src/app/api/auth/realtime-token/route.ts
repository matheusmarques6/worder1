export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { requireOrgFromAuth } from '@/lib/auth/require-org'

const NO_CACHE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' }

/**
 * Devolve o access token do PROPRIO usuario autenticado.
 *
 * Por que existe: o login grava `sb-access-token` como cookie httpOnly
 * (JS nao le), e o client Supabase do browser (`supabase-client.ts`) e
 * anon sem sessao. Realtime postgres_changes respeita RLS: sem JWT,
 * as policies *_org_select das tabelas whatsapp_cloud_* negam tudo e
 * nenhum evento chega. O hook useCloudInboxRealtime chama este endpoint
 * e repassa o token para supabaseClient.realtime.setAuth().
 *
 * Seguranca: same-origin + autenticado (requireOrgFromAuth valida o JWT
 * antes de devolver). So expoe o token ao seu proprio dono.
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

  return NextResponse.json({ token }, { headers: NO_CACHE_HEADERS })
}
