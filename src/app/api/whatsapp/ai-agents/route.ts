// =============================================
// DEPRECATED — substituído por /api/ai/agents (F1, schema canônico ai_agents)
// Mantido como stub durante a F0 para não quebrar a UI legada
// (componente AIAgentsTab) enquanto F1 reescreve o editor de agentes.
// =============================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest) {
  return NextResponse.json({ data: [] })
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Use /api/ai/agents.' },
    { status: 410 }
  )
}
