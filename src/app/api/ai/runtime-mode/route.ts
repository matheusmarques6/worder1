import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'
import { getRuntimeMode } from '@/lib/ai/runtime-rollout'

export const dynamic = 'force-dynamic'

// Plano IA M2 passo 16 — o editor do agente pergunta em que motor a org está
// (o preview do prompt e os avisos de ferramentas dependem disso). Era parte
// de /api/ai/agents/canonical, que morreu com o modelo multiagente.
export async function GET() {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })
  try {
    const mode = await getRuntimeMode(getSupabaseAdmin(), auth.user.organization_id)
    return NextResponse.json({ mode })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
