import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';
export const dynamic = 'force-dynamic';

// =====================================================
// POST - REPROCESSAR FONTE
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string; sourceId: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // body é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const { id: agentId, sourceId } = params
    const organizationId = auth.user.organization_id

    // Verificar se agente pertence à org autenticada
    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Verificar se fonte existe
    const { data: source, error: sourceError } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('id', sourceId)
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .single()

    if (sourceError || !source) {
      return NextResponse.json({ error: 'Fonte não encontrada' }, { status: 404 })
    }

    // Limpar chunks existentes
    await supabase
      .from('ai_agent_chunks')
      .delete()
      .eq('source_id', sourceId)

    // Atualizar status para pending
    const { error: updateError } = await supabase
      .from('ai_agent_sources')
      .update({
        status: 'pending',
        error_message: null,
        chunks_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)

    if (updateError) {
      console.error('Error updating source status:', updateError)
      throw updateError
    }

    // Disparar reprocessamento em background
    triggerReprocess(sourceId, organizationId).catch(err => {
      console.error('Error triggering reprocess:', err)
    })

    return NextResponse.json({
      success: true,
      message: 'Reprocessamento iniciado',
      source_id: sourceId,
    })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/sources/[sourceId]/reprocess:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// REPROCESSAMENTO EM BACKGROUND
// =====================================================

async function triggerReprocess(sourceId: string, organizationId: string) {
  const supabase = getSupabaseAdmin()
  try {
    // Achado 6 (follow-up fase 3): mesmo tratamento de sources/route.ts e
    // sources/upload/route.ts — item 25 fechou /api/ai/process/document pra
    // negar sempre sem segredo configurado (ambiente não é credencial).
    // Nunca manda a credencial vazia; falha ANTES do fetch, com uma
    // mensagem que nomeia a env que falta.
    const internalSecret = process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET
    if (!internalSecret) {
      throw new Error(
        'INTERNAL_API_SECRET (ou CRON_SECRET) não configurado neste ambiente — configure um dos dois (veja .env.example) para processar fontes de URL/texto.'
      )
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${internalSecret}`,
      },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
      }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering reprocess:', error)
    // Sem isso a fonte ficaria presa em 'pending' para sempre, sem nenhum
    // sinal pro lojista de que o reprocessamento não engatou.
    await supabase
      .from('ai_agent_sources')
      .update({
        status: 'error',
        error_message: `Falha ao iniciar processamento: ${error?.message || 'erro desconhecido'}. Clique em Reprocessar.`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', sourceId)
      .then(undefined, () => {})
  }
}
