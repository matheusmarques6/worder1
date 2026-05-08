// =============================================
// DEPRECATED — substituído por /api/ai/agents/[id] (F1, schema canônico ai_agents)
// Mantido como stub durante a F0 para não quebrar a UI legada
// enquanto F1 reescreve o editor de agentes.
// =============================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(_request: NextRequest, _ctx: { params: { id: string } }) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Use /api/ai/agents/[id].' },
    { status: 410 }
  )
}

export async function PUT(_request: NextRequest, _ctx: { params: { id: string } }) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Use /api/ai/agents/[id].' },
    { status: 410 }
  )
}

export async function DELETE(_request: NextRequest, _ctx: { params: { id: string } }) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Use /api/ai/agents/[id].' },
    { status: 410 }
  )
}
