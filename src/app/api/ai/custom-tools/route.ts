import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { encryptSecret } from '@/lib/crypto/secret-box'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// 10.7 — tools custom v1. Nascem DESLIGADAS: ligar exige teste ok (CHECK do
// schema). O valor de auth entra pelo secret-box da casa; o runtime decodifica
// com o mesmo codec. Regra dupla: a tool lê e consulta, nunca concede — o
// schema já barra métodos de escrita e nomes que sombreiem as nativas.

const SAFE_COLUMNS =
  'id, name, label, description, when_to_use, endpoint, method, auth_header_name, params, timeout_ms, enabled, last_test_status, last_tested_at, created_at'

export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const { data, error } = await getSupabaseAdmin()
    .from('ai_agent_custom_tools')
    .select(SAFE_COLUMNS)
    .eq('organization_id', auth.user.organization_id)
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tools: data ?? [] })
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const body = await request.json().catch(() => null)
  for (const field of ['name', 'label', 'description', 'when_to_use', 'endpoint'] as const) {
    if (!body?.[field]) {
      return NextResponse.json({ error: `${field} é obrigatório` }, { status: 400 })
    }
  }

  const { data, error } = await getSupabaseAdmin()
    .from('ai_agent_custom_tools')
    .insert({
      organization_id: auth.user.organization_id,
      name: String(body.name),
      label: String(body.label),
      description: String(body.description),
      when_to_use: String(body.when_to_use),
      endpoint: String(body.endpoint),
      method: body.method === 'POST' ? 'POST' : 'GET',
      auth_header_name: body.auth_header_name || 'Authorization',
      auth_header_value: body.auth_header_value
        ? encryptSecret(String(body.auth_header_value))
        : null,
      params: Array.isArray(body.params) ? body.params : [],
      timeout_ms: Number(body.timeout_ms) || 5000,
      // enabled nasce false; ligar é outro ato, depois do teste.
    })
    .select(SAFE_COLUMNS)
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json({ tool: data })
}
