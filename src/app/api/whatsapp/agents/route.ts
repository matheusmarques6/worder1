import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

// Module-level lazy client
let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

// Proxy for backward compatibility
const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    return (getDb() as any)[prop];
  }
});

// GET - Lista agentes
export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const orgId = searchParams.get('organization_id') || searchParams.get('organizationId');
  
  if (!orgId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
  }

  try {
    const includeStats = searchParams.get('include_stats') === 'true';
    const typeFilter = searchParams.get('type'); // 'human' | 'ai' | null

    // Primeiro tenta a nova tabela 'agents'
    let { data, error } = await supabase
      .from('agents')
      .select('*')
      .eq('organization_id', orgId)
      .order('created_at', { ascending: false });

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_agents')
        .select('*, user:profiles(first_name, last_name, avatar_url)')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false });
      
      data = result.data;
      error = result.error;
      
      // Converter formato antigo para novo
      if (data) {
        data = data.map((agent: any) => ({
          ...agent,
          type: agent.type || 'human', // Default para human se não tiver type
          status: agent.is_available ? 'online' : 'offline',
          total_conversations: agent.conversations_count || 0,
          total_messages: agent.messages_count || 0,
        }));
      }
    }

    if (error) throw error;

    let agents = data || [];

    // Filtrar por tipo se especificado
    if (typeFilter) {
      agents = agents.filter((a: any) => a.type === typeFilter);
    }

    // Adicionar stats se solicitado
    if (includeStats) {
      for (const agent of agents) {
        // Tenta nova tabela primeiro
        let { count: active } = await supabase
          .from('chat_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .eq('status', 'active');

        // Se não encontrou, tenta tabela antiga
        if (active === null) {
          const result = await supabase
            .from('whatsapp_agent_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .eq('status', 'active');
          active = result.count;
        }

        let { count: resolved } = await supabase
          .from('chat_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .eq('status', 'resolved');

        if (resolved === null) {
          const result = await supabase
            .from('whatsapp_agent_assignments')
            .select('*', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .eq('status', 'resolved');
          resolved = result.count;
        }

        agent.stats = { active_chats: active || 0, resolved_chats: resolved || 0 };
      }
    }

    return NextResponse.json({ agents });
  } catch (error: any) {
    console.error('Error fetching agents:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST - Criar agente ou atribuir chat
export async function POST(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { action, type } = body;
    const orgId = body.organization_id || body.organizationId;
    
    if (!orgId) {
      return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
    }

    // Ação: Atribuir chat
    if (action === 'assign') {
      const { conversation_id, agent_id } = body;
      if (!conversation_id) return NextResponse.json({ error: 'conversation_id required' }, { status: 400 });

      if (!agent_id) {
        // Remover atribuição
        await supabase.from('whatsapp_agent_assignments').delete().eq('conversation_id', conversation_id);
        await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('id', conversation_id);
        return NextResponse.json({ success: true, message: 'Assignment removed' });
      }

      // Verificar agente (tenta nova tabela, depois antiga)
      let { data: agent }: { data: any } = await supabase
        .from('agents')
        .select('id, type')
        .eq('id', agent_id)
        .eq('organization_id', orgId)
        .eq('is_active', true)
        .single();

      if (!agent) {
        const result = await supabase
          .from('whatsapp_agents')
          .select('id')
          .eq('id', agent_id)
          .eq('organization_id', orgId)
          .eq('is_active', true)
          .single();
        agent = result.data;
      }

      if (!agent) return NextResponse.json({ error: 'Agent not found' }, { status: 404 });

      // Criar/atualizar atribuição
      await supabase.from('whatsapp_agent_assignments').upsert({
        organization_id: orgId,
        agent_id,
        conversation_id,
        status: 'active',
        assigned_at: new Date().toISOString(),
      }, { onConflict: 'conversation_id' });

      await supabase.from('whatsapp_conversations').update({ assigned_agent_id: agent_id }).eq('id', conversation_id);

      return NextResponse.json({ success: true });
    }

    // Ação: Resolver chat
    if (action === 'resolve') {
      const { conversation_id } = body;
      await supabase.from('whatsapp_agent_assignments').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('conversation_id', conversation_id);
      await supabase.from('whatsapp_conversations').update({ status: 'closed' }).eq('id', conversation_id);
      return NextResponse.json({ success: true });
    }

    // Criar agente
    const { name, email, role = 'agent', ai_config, password } = body;
    const agentType = type || 'human';

    if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });

    // Validações específicas por tipo
    if (agentType === 'human') {
      if (!email) return NextResponse.json({ error: 'email is required for human agents' }, { status: 400 });

      // Verificar limite de 3 agentes humanos
      const { count: humanCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('type', 'human');

      // Se a tabela não existe, verificar na antiga
      if (humanCount === null) {
        const { count } = await supabase
          .from('whatsapp_agents')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        
        if (count && count >= 3) {
          return NextResponse.json({ error: 'Limite de 3 agentes humanos atingido' }, { status: 400 });
        }
      } else if (humanCount >= 3) {
        return NextResponse.json({ error: 'Limite de 3 agentes humanos atingido' }, { status: 400 });
      }

      // Verificar se email já existe
      const { data: existing } = await supabase
        .from('agents')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', email)
        .single();

      if (!existing) {
        const { data: existingOld } = await supabase
          .from('whatsapp_agents')
          .select('id')
          .eq('organization_id', orgId)
          .eq('email', email)
          .single();
        
        if (existingOld) {
          return NextResponse.json({ error: 'Um agente com este email já existe' }, { status: 409 });
        }
      } else {
        return NextResponse.json({ error: 'Um agente com este email já existe' }, { status: 409 });
      }
    }

    if (agentType === 'ai') {
      if (!ai_config || !ai_config.model) {
        return NextResponse.json({ error: 'ai_config with model is required for AI agents' }, { status: 400 });
      }
    }

    // Inserir na nova tabela agents
    const insertData: any = {
      organization_id: orgId,
      type: agentType,
      name,
      email: email || null,
      is_active: true,
      status: agentType === 'ai' ? 'online' : 'offline',
      total_conversations: 0,
      total_messages: 0,
    };

    if (agentType === 'ai' && ai_config) {
      insertData.ai_config = ai_config;
    }

    let { data, error } = await supabase
      .from('agents')
      .insert(insertData)
      .select()
      .single();

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_agents')
        .insert({
          organization_id: orgId,
          name,
          email,
          role,
          is_active: true,
          is_available: agentType === 'ai',
        })
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    // Se for agente humano, criar permissões padrão
    if (agentType === 'human' && data) {
      await supabase.from('agent_permissions').insert({
        agent_id: data.id,
        access_level: role === 'admin' ? 'admin' : 'agent',
        whatsapp_access_all: false,
        pipeline_access_all: false,
      }).single();
    }

    // Se for agente IA, criar configuração
    if (agentType === 'ai' && data && ai_config) {
      await supabase.from('ai_agent_configs').insert({
        agent_id: data.id,
        provider: ai_config.provider || 'openai',
        model: ai_config.model,
        temperature: ai_config.temperature || 0.3,
        max_tokens: ai_config.max_tokens || 500,
        system_prompt: ai_config.system_prompt || '',
        greeting_message: ai_config.greeting_message || '',
        transfer_keywords: ai_config.transfer_keywords || ['atendente', 'humano', 'pessoa'],
        transfer_to_queue: ai_config.transfer_to_queue !== false,
        use_whatsapp: true,
        always_active: false,
        only_when_no_human: true,
      }).single();
    }

    return NextResponse.json({ agent: data }, { status: 201 });
  } catch (error: any) {
    console.error('Error creating agent:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH - Atualizar agente
export async function PATCH(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { id, organization_id, organizationId, ...updateData } = body;
    const orgId = organization_id || organizationId;
    
    if (!id) return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    if (!orgId) return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });

    const allowed = ['name', 'email', 'role', 'is_active', 'is_available', 'max_concurrent_chats', 'status'];
    const filtered: any = {};
    allowed.forEach(f => { if (f in updateData) filtered[f] = updateData[f]; });

    // Tentar nova tabela primeiro
    let { data, error } = await supabase
      .from('agents')
      .update({ ...filtered, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_agents')
        .update({ ...filtered, updated_at: new Date().toISOString() })
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }

    if (error) throw error;
    return NextResponse.json({ agent: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// DELETE - Deletar agente
export async function DELETE(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const searchParams = request.nextUrl.searchParams;
    const id = searchParams.get('id');
    const orgId = searchParams.get('organization_id') || searchParams.get('organizationId');
    
    if (!id) return NextResponse.json({ error: 'Agent ID required' }, { status: 400 });
    if (!orgId) return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });

    // Verificar chats ativos
    const { count } = await supabase
      .from('whatsapp_agent_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('status', 'active');

    if (count && count > 0) {
      return NextResponse.json({ error: 'Agente possui chats ativos. Transfira ou finalize antes de excluir.' }, { status: 400 });
    }

    // Deletar atribuições e referências
    await supabase.from('whatsapp_agent_assignments').delete().eq('agent_id', id);
    await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('assigned_agent_id', id);
    
    // Tentar deletar da nova tabela
    let { error } = await supabase
      .from('agents')
      .delete()
      .eq('id', id)
      .eq('organization_id', orgId);

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_agents')
        .delete()
        .eq('id', id)
        .eq('organization_id', orgId);
      error = result.error;
    }

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
