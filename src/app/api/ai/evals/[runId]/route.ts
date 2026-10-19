import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { RuntimeNotConfigured, callRuntime } from '@/lib/ai/runtime-client'

export const dynamic = 'force-dynamic'

// Plano IA M4 passo 26 — andamento e resultado de uma avaliação da org.
export async function GET(_request: NextRequest, props: { params: Promise<{ runId: string }> }) {
  const params = await props.params;
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const { status, payload } = await callRuntime('/internal/eval-run', {
      organization_id: auth.user.organization_id,
      run_id: params.runId,
    })
    if (status === 200 || status === 404 || status === 400) return NextResponse.json(payload, { status })
    return NextResponse.json({ error: payload?.error || 'Consulta indisponível' }, { status: 502 })
  } catch (e: any) {
    const status = e instanceof RuntimeNotConfigured ? 503 : 502
    return NextResponse.json({ error: e.message }, { status })
  }
}
