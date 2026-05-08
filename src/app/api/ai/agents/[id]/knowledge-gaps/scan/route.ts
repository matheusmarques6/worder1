// =============================================
// POST /api/ai/agents/[id]/knowledge-gaps/scan
// Roda o detector síncrono. Pode ser chamado por usuário (botão "Rastrear
// gaps") ou por cron (futuro QStash schedule).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { scanKnowledgeGaps } from '@/lib/ai/knowledge-gaps/detector'

export const runtime = 'nodejs'
export const maxDuration = 60
export const dynamic = 'force-dynamic'

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await getAuthClient()
  if (!auth) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 })

  const url = new URL(req.url)
  const days = parseInt(url.searchParams.get('days') || '7', 10)

  try {
    const result = await scanKnowledgeGaps({
      agentId: params.id,
      organizationId: auth.user.organization_id,
      days,
    })
    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'erro desconhecido' },
      { status: 500 },
    )
  }
}
