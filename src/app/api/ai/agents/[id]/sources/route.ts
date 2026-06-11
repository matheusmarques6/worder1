import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient } from '@/lib/api-utils';
import { assertAgentInOrg } from '@/lib/ai/agent-access';
import { findStaleSourceIds, STALE_SOURCE_MESSAGE } from '@/lib/ai/stale-sources';
export const dynamic = 'force-dynamic';

// =====================================================
// GET - LISTAR FONTES DO AGENTE
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id da
    // querystring é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id
    const organizationId = auth.user.organization_id

    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Buscar fontes
    const { data: sources, error } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching sources:', error)
      throw error
    }

    // Recuperação de fontes órfãs: pending/processing há >1h viram 'error'
    // (com mensagem acionável) — o botão Reprocessar da UI faz o resto.
    const staleIds = findStaleSourceIds(sources || [])
    if (staleIds.length > 0) {
      console.warn(`[ai/sources] Marcando ${staleIds.length} fonte(s) órfã(s) como error:`, staleIds)
      const nowIso = new Date().toISOString()
      await supabase
        .from('ai_agent_sources')
        .update({ status: 'error', error_message: STALE_SOURCE_MESSAGE, updated_at: nowIso })
        .in('id', staleIds)
        .eq('organization_id', organizationId)
      for (const s of sources || []) {
        if (staleIds.includes(s.id)) {
          s.status = 'error'
          s.error_message = STALE_SOURCE_MESSAGE
          s.updated_at = nowIso
        }
      }
    }

    // Calcular stats
    const stats = {
      total: sources?.length || 0,
      ready: sources?.filter(s => s.status === 'ready').length || 0,
      processing: sources?.filter(s => s.status === 'processing').length || 0,
      pending: sources?.filter(s => s.status === 'pending').length || 0,
      error: sources?.filter(s => s.status === 'error').length || 0,
      total_chunks: sources?.reduce((sum, s) => sum + (s.chunks_count || 0), 0) || 0,
    }

    return NextResponse.json({ sources: sources || [], stats })

  } catch (error: any) {
    console.error('Error in GET /api/ai/agents/[id]/sources:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// POST - CRIAR FONTE (URL ou TEXTO)
// =====================================================

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // ✅ P1: org SEMPRE do usuário autenticado; organization_id do
    // body é aceito e IGNORADO (compat com frontend atual).
    const auth = await getAuthClient();
    if (!auth) {
      return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });
    }

    const supabase = getSupabaseAdmin()
    const agentId = params.id
    const organizationId = auth.user.organization_id
    const body = await request.json()

    const { source_type, name } = body

    // Validações
    if (!source_type || !['url', 'text', 'products'].includes(source_type)) {
      return NextResponse.json({ error: 'source_type inválido' }, { status: 400 })
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Verificar se agente pertence à org autenticada
    const access = await assertAgentInOrg(supabase, agentId, organizationId)
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status })
    }

    // Preparar dados da fonte
    const sourceData: Record<string, any> = {
      organization_id: organizationId,
      agent_id: agentId,
      source_type,
      name: name.trim(),
      status: 'pending',
      chunks_count: 0,
    }

    // Dados específicos por tipo
    if (source_type === 'url') {
      if (!body.url) {
        return NextResponse.json({ error: 'url é obrigatório para source_type=url' }, { status: 400 })
      }
      sourceData.url = body.url
      sourceData.pages_crawled = 0
    } else if (source_type === 'text') {
      if (!body.text_content) {
        return NextResponse.json({ error: 'text_content é obrigatório para source_type=text' }, { status: 400 })
      }
      if (body.text_content.length > 10000) {
        return NextResponse.json({ error: 'text_content excede o limite de 10.000 caracteres' }, { status: 400 })
      }
      sourceData.text_content = body.text_content
    } else if (source_type === 'products') {
      if (!body.integration_id) {
        return NextResponse.json({ error: 'integration_id é obrigatório para source_type=products' }, { status: 400 })
      }
      sourceData.integration_id = body.integration_id
      sourceData.integration_type = body.integration_type
      sourceData.products_count = 0
    }

    // Inserir fonte
    const { data: source, error } = await supabase
      .from('ai_agent_sources')
      .insert(sourceData)
      .select()
      .single()

    if (error) {
      console.error('Error creating source:', error)
      throw error
    }

    // Para URL e texto, iniciar processamento assíncrono
    if (source_type === 'url' || source_type === 'text') {
      // Disparar processamento em background
      processSourceAsync(source.id, organizationId).catch(err => {
        console.error('Error in async source processing:', err)
      })
    }

    return NextResponse.json({ source }, { status: 201 })

  } catch (error: any) {
    console.error('Error in POST /api/ai/agents/[id]/sources:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// =====================================================
// PROCESSAMENTO ASSÍNCRONO
// =====================================================

async function processSourceAsync(sourceId: string, organizationId: string) {
  const supabase = getSupabaseAdmin()
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

    const res = await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        authorization: `Bearer ${process.env.INTERNAL_API_SECRET || process.env.CRON_SECRET || ''}`,
      },
      body: JSON.stringify({ source_id: sourceId, organization_id: organizationId }),
    })

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      throw new Error(body?.error || `process/document respondeu ${res.status}`)
    }
  } catch (error: any) {
    console.error('Error triggering source processing:', error)
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
