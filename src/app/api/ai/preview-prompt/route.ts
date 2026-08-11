import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

// POST /api/ai/preview-prompt — o proxy para o listener do runtime
// (server.py: POST /internal/preview-prompt). Uma fonte só de compile: o
// preview da UI é a MESMA compile_prompt() do turno, em modo preview — o
// buildPrompt() de protótipo nunca vira produção (doc §4.4-6).
//
// O token de serviço fica AQUI (env do servidor); o browser nunca o vê.
export async function POST(request: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const runtimeUrl = process.env.AGENTS_RUNTIME_URL
  const token = process.env.AGENTS_PREVIEW_TOKEN
  if (!runtimeUrl || !token) {
    return NextResponse.json(
      {
        error:
          'Runtime não configurado (AGENTS_RUNTIME_URL / AGENTS_PREVIEW_TOKEN). ' +
          'O preview fica disponível quando o runtime estiver no ar — ver runtime/DEPLOY.md.',
      },
      { status: 503 }
    )
  }

  const body = await request.json().catch(() => ({}))
  try {
    const upstream = await fetch(`${runtimeUrl.replace(/\/$/, '')}/internal/preview-prompt`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        organization_id: auth.user.organization_id,
        event_type: body.event_type || 'whatsapp.received',
        transcript: Array.isArray(body.transcript) ? body.transcript : undefined,
        window_open: body.window_open,
        channel: body.channel,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const payload = await upstream.json()
    return NextResponse.json(payload, { status: upstream.status })
  } catch (error: any) {
    return NextResponse.json(
      { error: `Runtime inalcançável: ${error.message}` },
      { status: 502 }
    )
  }
}
