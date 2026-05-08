// =============================================
// DEPRECATED — substituído pela tabela ai_agents.llm_config (F1)
// Mantido como stub durante a F0 para não quebrar UI legada de configurações
// IA por organização. F1 dissolve esse conceito em ai_agents (per-agent llm_config).
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { AI_MODELS } from '@/lib/whatsapp/ai-providers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  if (action === 'models') {
    return NextResponse.json({ models: AI_MODELS })
  }

  return NextResponse.json({ configs: [] })
}

export async function POST(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Configurações de LLM agora residem em ai_agents.llm_config.' },
    { status: 410 }
  )
}

export async function PATCH(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Configurações de LLM agora residem em ai_agents.llm_config.' },
    { status: 410 }
  )
}

export async function DELETE(_request: NextRequest) {
  return NextResponse.json(
    { error: 'Endpoint legado desativado. Configurações de LLM agora residem em ai_agents.llm_config.' },
    { status: 410 }
  )
}
