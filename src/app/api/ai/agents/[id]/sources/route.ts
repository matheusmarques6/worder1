import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils';

// =====================================================
// GET - LISTAR FONTES DO AGENTE
// =====================================================

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const agentId = params.id

    // Buscar fontes - RLS filtra automaticamente
    const { data: sources, error } = await supabase
      .from('ai_agent_sources')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Error fetching sources:', error)
      throw error
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
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const agentId = params.id
    const body = await request.json()

    const { source_type, name } = body

    // Validações
    if (!source_type || !['url', 'text', 'products'].includes(source_type)) {
      return NextResponse.json({ error: 'source_type inválido' }, { status: 400 })
    }

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'name é obrigatório' }, { status: 400 })
    }

    // Verificar se agente existe - RLS filtra automaticamente
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('id', agentId)
      .single()

    if (agentError || !agent) {
      return NextResponse.json({ error: 'Agente não encontrado' }, { status: 404 })
    }

    // Preparar dados da fonte - usa organization_id do usuário autenticado
    const sourceData: Record<string, any> = {
      organization_id: user.organization_id,
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
      processSourceAsync(source.id, user.organization_id).catch(err => {
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
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    
    await fetch(`${baseUrl}/api/ai/process/document`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: sourceId,
        organization_id: organizationId,
      }),
    })
  } catch (error) {
    console.error('Error triggering source processing:', error)
  }
}
