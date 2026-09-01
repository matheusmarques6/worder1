import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { decryptSecret, isEncryptedSecret } from '@/lib/crypto/secret-box'
import { safeFetch, BLOCKED_PREFIX } from '@/lib/ai/ssrf-guard'
import { GENERIC_REFUSAL_MESSAGE } from './refusal-message'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST — o teste OBRIGATÓRIO antes de ligar (10.7): chamada real, feita do
// servidor (o browser nunca vê o header de auth), cap de 10s. O resultado
// grava last_test_status — o CHECK do schema só deixa ligar com 'ok'.
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const supabase = getSupabaseAdmin()
  const { data: tool } = await supabase
    .from('ai_agent_custom_tools')
    .select('*')
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)
    .single()
  if (!tool) return NextResponse.json({ error: 'Tool não encontrada' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const args: Record<string, unknown> =
    body && typeof body.args === 'object' && body.args ? body.args : {}

  const headers: Record<string, string> = {}
  if (tool.auth_header_value) {
    headers[tool.auth_header_name || 'Authorization'] = isEncryptedSecret(tool.auth_header_value)
      ? decryptSecret(tool.auth_header_value)
      : tool.auth_header_value
  }

  let status: 'ok' | 'failed' = 'failed'
  let detail: any = null
  try {
    const url = new URL(tool.endpoint)
    if (tool.method === 'GET') {
      for (const [key, value] of Object.entries(args)) url.searchParams.set(key, String(value))
    }
    // item 19 do audit: o único filtro até aqui era o CHECK do schema
    // (endpoint https://), que não impede apontar pra rede interna — e esta
    // rota DEVOLVE O CORPO pro lojista, o que faz do SSRF aqui uma leitura
    // direta (não precisa do agente repetir o conteúdo). safeFetch valida
    // pra onde o host resolve (e revalida a cada redirect) antes de buscar.
    const response = await safeFetch(url.toString(), {
      method: tool.method,
      headers:
        tool.method === 'POST'
          ? { ...headers, 'Content-Type': 'application/json' }
          : headers,
      body: tool.method === 'POST' ? JSON.stringify(args) : undefined,
      signal: AbortSignal.timeout(10_000),
    })
    const text = await response.text()
    status = response.ok ? 'ok' : 'failed'
    detail = { http_status: response.status, body: text.slice(0, 2000) }
  } catch (e: any) {
    const message: string = e?.message || 'falha na chamada'
    if (message.startsWith(BLOCKED_PREFIX)) {
      // Log carrega o motivo específico (útil pra operação); o lojista só
      // vê a mensagem genérica — ver comentário de GENERIC_REFUSAL_MESSAGE.
      console.error('[custom-tools/test] endpoint recusado pelo portão SSRF', {
        tool_id: params.id,
        organization_id: auth.user.organization_id,
        detail: message,
      })
      detail = { error: GENERIC_REFUSAL_MESSAGE }
    } else {
      detail = { error: message }
    }
  }

  await supabase
    .from('ai_agent_custom_tools')
    .update({
      last_test_status: status,
      last_tested_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Falhou de novo? Desliga: uma tool ligada não pode ter último teste
      // reprovado (espelha o CHECK do schema).
      ...(status === 'failed' ? { enabled: false } : {}),
    })
    .eq('id', params.id)
    .eq('organization_id', auth.user.organization_id)

  return NextResponse.json({ status, detail })
}
