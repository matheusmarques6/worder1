import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import {
  listRecentTurns,
  getFlywheelStats,
  saveAnnotations,
  type AnnotationInput,
  type Rating,
} from '@/lib/ai/annotations'
export const dynamic = 'force-dynamic';

const VALID_RATINGS: Rating[] = ['good', 'bad', 'fix']

/** Confirma que o agente pertence à org autenticada antes de ler/gravar. */
async function assertAgentInOrg(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  agentId: string,
  organizationId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_agents')
    .select('id')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .single()
  return !error && !!data
}

// =====================================================
// GET - TURNOS RECENTES + FLYWHEEL (Bloco F2)
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação (espelha o padrão endurecido de [id]/route.ts)
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id

    // ✅ Escopo de org vem SEMPRE do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!(await assertAgentInOrg(supabase, agentId, organizationId))) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    const limitParam = Number(request.nextUrl.searchParams.get('limit'))
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : 20

    const [turns, stats] = await Promise.all([
      listRecentTurns(supabase, agentId, organizationId, limit),
      getFlywheelStats(supabase, agentId, organizationId),
    ])

    return NextResponse.json({ turns, stats })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/annotations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - SALVAR LOTE DE ANOTAÇÕES (Bloco F2)
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ Validar autenticação (espelha o padrão endurecido de [id]/route.ts)
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id

    // ✅ Org e autor vêm do usuário autenticado, nunca do cliente
    const organizationId = auth.user.organization_id
    const userId = auth.user.id ?? null

    if (!organizationId) {
      return NextResponse.json({ error: 'organization_id é obrigatório' }, { status: 400 })
    }

    if (!(await assertAgentInOrg(supabase, agentId, organizationId))) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    const body = await request.json().catch(() => null)
    const rawList = Array.isArray(body?.annotations) ? body.annotations : []

    const items: AnnotationInput[] = []
    for (const entry of rawList) {
      if (!entry || typeof entry.trace_id !== 'string') continue
      const rating = entry.rating
      if (rating !== null && !VALID_RATINGS.includes(rating)) continue
      items.push({
        trace_id: entry.trace_id,
        rating: rating === null ? null : (rating as Rating),
        correction_text:
          typeof entry.correction_text === 'string' ? entry.correction_text : null,
      })
    }

    const { saved, deleted } = await saveAnnotations(
      supabase,
      agentId,
      organizationId,
      userId,
      items
    )

    const stats = await getFlywheelStats(supabase, agentId, organizationId)

    return NextResponse.json({ saved, deleted, stats })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/annotations:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
