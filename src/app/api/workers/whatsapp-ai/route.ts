// =============================================
// DEPRECATED — substituído por /api/workers/ai-respond (F1)
// O novo worker usa buffer Redis (debounce de mensagens em rajada),
// AgentRunner monolítico e ai_executions para tracing.
// =============================================

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Worker legado desativado. Use /api/workers/ai-respond.' },
    { status: 410 }
  )
}

export async function GET() {
  return NextResponse.json({
    status: 'deprecated',
    replacement: '/api/workers/ai-respond',
    timestamp: new Date().toISOString(),
  })
}
