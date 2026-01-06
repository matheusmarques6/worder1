import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

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

// Admin client para criar usuários (usa service role key)
function getAdminClient() {
  return getSupabaseAdmin();
}

// Validação de senha forte
function validatePassword(password: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Senha deve ter no mínimo 8 caracteres');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra maiúscula');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Senha deve conter pelo menos uma letra minúscula');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Senha deve conter pelo menos um número');
  }
  if (!/[!@#$%^&*(),.?":{}|<>\-_=+\[\]\\;'/`~]/.test(password)) {
    errors.push('Senha deve conter pelo menos um caractere especial');
  }
  
  return { valid: errors.length === 0, errors };
}

// Gerar senha forte aleatória
function generateStrongPassword(length: number = 12): string {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  const special = '!@#$%^&*()_+-=';
  
  const allChars = uppercase + lowercase + numbers + special;
  
  let password = '';
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  
  for (let i = password.length; i < length; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// GET - Lista agentes
export async function GET(request: NextRequest) {
  try {
    getDb();
  } catch {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const searchParams = request.nextUrl.searchParams;
  const orgId = searchParams.get('organization_id') || searchParams.get('organizationId');
  const storeId = searchParams.get('store_id') || searchParams.get('storeId'); // ✅ NOVO
  
  if (!orgId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
  }

  try {
    const includeStats = searchParams.get('include_stats') === 'true';
    const typeFilter = searchParams.get('type');

    // Primeiro tenta a nova tabela 'agents'
    let query = supabase
      .from('agents')
      .select('*')
      .eq('organization_id', orgId);
    
    // ✅ NOVO: Filtrar por store_id se fornecido
    if (storeId) {
      query = query.eq('store_id', storeId);
    }
    
    let { data, error } = await query.order('created_at', { ascending: false });

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      let oldQuery = supabase
        .from('whatsapp_agents')
        .select('*, user:profiles(first_name, last_name, avatar_url)')
        .eq('organization_id', orgId);
      
      // ✅ NOVO: Filtrar por store_id se fornecido
      if (storeId) {
        oldQuery = oldQuery.eq('store_id', storeId);
      }
      
      const result = await oldQuery.order('created_at', { ascending: false });
      
      data = result.data;
      error = result.error;
      
      // Converter formato antigo para novo
      if (data) {
        data = data.map((agent: any) => ({
          ...agent,
          type: agent.type || 'human',
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

    // Incluir estatísticas se solicitado
    if (includeStats) {
      for (const agent of agents) {
        // Tentar nova tabela chat_assignments
        let { count: active } = await supabase
          .from('chat_assignments')
          .select('*', { count: 'exact', head: true })
          .eq('agent_id', agent.id)
          .eq('status', 'active');

        // Se não existe, tenta antiga
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
        await supabase.from('whatsapp_agent_assignments').delete().eq('conversation_id', conversation_id);
        await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('id', conversation_id);
        return NextResponse.json({ success: true, message: 'Assignment removed' });
      }

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

    // =====================================================
    // CRIAR AGENTE
    // =====================================================
    const { 
      name, 
      email, 
      password,
      role = 'agent', 
      ai_config,
      permissions,
      send_welcome_email = false,
      force_password_change = true,
    } = body;
    const agentType = type || 'human';

    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // =====================================================
    // CRIAR AGENTE HUMANO
    // =====================================================
    if (agentType === 'human') {
      if (!email) {
        return NextResponse.json({ error: 'email is required for human agents' }, { status: 400 });
      }

      // Verificar limite de 3 agentes humanos
      let humanCount = 0;
      const { count } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('type', 'human');
      
      humanCount = count || 0;

      // Se a tabela não existe, verificar na antiga
      if (count === null) {
        const { count: oldCount } = await supabase
          .from('whatsapp_agents')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', orgId);
        humanCount = oldCount || 0;
      }

      if (humanCount >= 3) {
        return NextResponse.json({ error: 'Limite de 3 agentes humanos atingido' }, { status: 400 });
      }

      // Verificar se email já existe na organização
      const { data: existingAgent } = await supabase
        .from('agents')
        .select('id')
        .eq('organization_id', orgId)
        .eq('email', email)
        .single();

      if (existingAgent) {
        return NextResponse.json({ error: 'Um agente com este email já existe' }, { status: 409 });
      }

      // Gerar ou validar senha
      let finalPassword = password;
      let passwordGenerated = false;

      if (!finalPassword) {
        finalPassword = generateStrongPassword(12);
        passwordGenerated = true;
      } else {
        // Validar força da senha
        const passwordValidation = validatePassword(finalPassword);
        if (!passwordValidation.valid) {
          return NextResponse.json({ 
            error: 'Senha fraca', 
            details: passwordValidation.errors 
          }, { status: 400 });
        }
      }

      // Criar usuário no Supabase Auth
      const adminClient = getAdminClient();
      if (!adminClient) {
        return NextResponse.json({ 
          error: 'Configuração do servidor incompleta. SUPABASE_SERVICE_ROLE_KEY não definida.' 
        }, { status: 500 });
      }

      // Verificar se usuário já existe no Auth
      const { data: existingAuthUsers } = await adminClient.auth.admin.listUsers();
      const existingAuthUser = existingAuthUsers?.users?.find(u => u.email === email);

      let authUserId: string;

      if (existingAuthUser) {
        // Usuário já existe no Auth - verificar se pertence a outra organização
        const { data: existingProfile } = await supabase
          .from('profiles')
          .select('organization_id')
          .eq('id', existingAuthUser.id)
          .single();

        if (existingProfile && existingProfile.organization_id !== orgId) {
          return NextResponse.json({ 
            error: 'Este email já está registrado em outra organização' 
          }, { status: 409 });
        }

        authUserId = existingAuthUser.id;
      } else {
        // Criar novo usuário no Auth
        const { data: authData, error: authError } = await adminClient.auth.admin.createUser({
          email,
          password: finalPassword,
          email_confirm: true, // Já confirma o email
          user_metadata: {
            name,
            role: 'agent', // Metadata pode ter qualquer valor
            organization_id: orgId,
            is_agent: true,
          }
        });

        if (authError) {
          console.error('Error creating auth user:', authError);
          return NextResponse.json({ 
            error: `Erro ao criar usuário: ${authError.message}` 
          }, { status: 500 });
        }

        authUserId = authData.user.id;

        // Criar perfil - tentar com 'agent', se falhar usar 'member'
        let profileRole = 'agent';
        let { error: profileError } = await supabase
          .from('profiles')
          .upsert({
            id: authUserId,
            email,
            first_name: name.split(' ')[0],
            last_name: name.split(' ').slice(1).join(' ') || '',
            organization_id: orgId,
            role: profileRole,
            must_change_password: force_password_change,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        // Se falhou com erro de enum, tentar com 'member'
        if (profileError && profileError.message.includes('enum')) {
          console.log('Trying with member role instead of agent');
          profileRole = 'member';
          const retryResult = await supabase
            .from('profiles')
            .upsert({
              id: authUserId,
              email,
              first_name: name.split(' ')[0],
              last_name: name.split(' ').slice(1).join(' ') || '',
              organization_id: orgId,
              role: profileRole,
              must_change_password: force_password_change,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'id' });
          profileError = retryResult.error;
        }

        if (profileError) {
          console.error('Error creating profile:', profileError);
          // Tentar deletar o usuário criado no Auth
          await adminClient.auth.admin.deleteUser(authUserId);
          return NextResponse.json({ 
            error: `Erro ao criar perfil: ${profileError.message}` 
          }, { status: 500 });
        }
      }

      // Criar agente vinculado ao usuário
      // ✅ NOVO: Incluir store_id se fornecido
      const storeId = body.store_id || body.storeId;
      const agentData: any = {
        organization_id: orgId,
        user_id: authUserId,
        type: 'human',
        name,
        email,
        is_active: true,
        status: 'offline',
        total_conversations: 0,
        total_messages: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // ✅ NOVO: Adicionar store_id se existir
      if (storeId) {
        agentData.store_id = storeId;
      }

      let { data: agent, error: agentError } = await supabase
        .from('agents')
        .insert(agentData)
        .select()
        .single();

      // Se a tabela agents não existe, usar a antiga
      if (agentError && agentError.code === '42P01') {
        const oldAgentData: any = {
          organization_id: orgId,
          user_id: authUserId,
          name,
          email,
          role,
          is_active: true,
          is_available: false,
        };
        
        // ✅ NOVO: Adicionar store_id se existir
        if (storeId) {
          oldAgentData.store_id = storeId;
        }
        
        const result = await supabase
          .from('whatsapp_agents')
          .insert(oldAgentData)
          .select()
          .single();
        
        agent = result.data;
        agentError = result.error;
      }

      if (agentError) {
        console.error('Error creating agent:', agentError);
        // Cleanup: deletar usuário criado
        if (!existingAuthUser) {
          await adminClient.auth.admin.deleteUser(authUserId);
        }
        return NextResponse.json({ error: agentError.message }, { status: 500 });
      }

      // Criar permissões
      const permissionsData = {
        agent_id: agent.id,
        access_level: role === 'admin' ? 'admin' : 'agent',
        
        // WhatsApp/Conversas
        whatsapp_access_all: permissions?.whatsapp_access_all || false,
        whatsapp_number_ids: permissions?.whatsapp_number_ids || [],
        can_view_all_conversations: permissions?.can_view_all_conversations || false,
        can_transfer_conversations: permissions?.can_transfer_conversations ?? permissions?.can_transfer_chats ?? true,
        can_use_ai_suggestions: permissions?.can_use_ai_suggestions ?? true,
        can_send_media: permissions?.can_send_media ?? permissions?.can_send_messages ?? true,
        can_use_quick_replies: permissions?.can_use_quick_replies ?? true,
        
        // CRM
        can_access_crm: permissions?.can_access_crm || false,
        can_access_pipelines: permissions?.can_access_pipelines ?? permissions?.can_edit_pipeline ?? false,
        can_create_deals: permissions?.can_create_deals || false,
        can_manage_tags: permissions?.can_manage_tags || false,
        pipeline_access_all: permissions?.pipeline_access_all || false,
        pipeline_ids: permissions?.pipeline_ids || [],
        
        // Contatos
        can_view_contact_info: permissions?.can_view_contact_info ?? true,
        can_edit_contact_info: permissions?.can_edit_contact_info || false,
        can_add_notes: permissions?.can_add_notes ?? true,
        can_view_order_history: permissions?.can_view_order_history ?? true,
        
        // Analytics
        can_view_analytics: permissions?.can_view_analytics || false,
        can_view_reports: permissions?.can_view_reports || false,
        
        // Limites
        max_concurrent_chats: permissions?.max_concurrent_chats ?? 10,
        allowed_hours_start: permissions?.allowed_hours_start || null,
        allowed_hours_end: permissions?.allowed_hours_end || null,
        allowed_days: permissions?.allowed_days || null,
        
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await supabase.from('agent_permissions').upsert(permissionsData, { onConflict: 'agent_id' });

      // Atualizar user_metadata com agent_id
      await adminClient.auth.admin.updateUserById(authUserId, {
        user_metadata: {
          name,
          role: 'agent',
          organization_id: orgId,
          is_agent: true,
          agent_id: agent.id,
        }
      });

      // TODO: Enviar email de boas-vindas se send_welcome_email = true
      // Isso seria feito com um serviço de email como Resend, SendGrid, etc.

      return NextResponse.json({ 
        agent,
        password_generated: passwordGenerated,
        temporary_password: passwordGenerated ? finalPassword : undefined,
        message: passwordGenerated 
          ? 'Agente criado com senha temporária. Anote a senha pois ela não será mostrada novamente.'
          : 'Agente criado com sucesso.'
      }, { status: 201 });
    }

    // =====================================================
    // CRIAR AGENTE IA
    // =====================================================
    if (agentType === 'ai') {
      if (!ai_config || !ai_config.model) {
        return NextResponse.json({ 
          error: 'ai_config with model is required for AI agents' 
        }, { status: 400 });
      }

      // ✅ NOVO: Pegar store_id do body
      const storeIdAI = body.store_id || body.storeId;
      
      const agentData: any = {
        organization_id: orgId,
        type: 'ai',
        name,
        email: null,
        is_active: true,
        status: 'online', // IA está sempre online
        ai_config,
        total_conversations: 0,
        total_messages: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      
      // ✅ NOVO: Adicionar store_id se existir
      if (storeIdAI) {
        agentData.store_id = storeIdAI;
      }

      let { data: agent, error: agentError } = await supabase
        .from('agents')
        .insert(agentData)
        .select()
        .single();

      // Se a tabela agents não existe, usar a antiga
      if (agentError && agentError.code === '42P01') {
        const oldAgentDataAI: any = {
          organization_id: orgId,
          name,
          type: 'ai',
          is_active: true,
          is_available: true,
        };
        
        // ✅ NOVO: Adicionar store_id se existir
        if (storeIdAI) {
          oldAgentDataAI.store_id = storeIdAI;
        }
        
        const result = await supabase
          .from('whatsapp_agents')
          .insert(oldAgentDataAI)
          .select()
          .single();
        
        agent = result.data;
        agentError = result.error;
      }

      if (agentError) throw agentError;

      // Criar configuração de IA
      if (agent) {
        await supabase.from('ai_agent_configs').upsert({
          agent_id: agent.id,
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
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }, { onConflict: 'agent_id' });
      }

      return NextResponse.json({ agent }, { status: 201 });
    }

    return NextResponse.json({ error: 'Invalid agent type' }, { status: 400 });

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

    const allowed = ['name', 'email', 'role', 'is_active', 'is_available', 'max_concurrent_chats', 'status', 'avatar_url'];
    const filtered: any = {};
    allowed.forEach(f => { if (f in updateData) filtered[f] = updateData[f]; });
    filtered.updated_at = new Date().toISOString();

    // Tentar nova tabela primeiro
    let { data, error } = await supabase
      .from('agents')
      .update(filtered)
      .eq('id', id)
      .eq('organization_id', orgId)
      .select()
      .single();

    // Se a nova tabela não existe, usa a antiga
    if (error && error.code === '42P01') {
      const result = await supabase
        .from('whatsapp_agents')
        .update(filtered)
        .eq('id', id)
        .eq('organization_id', orgId)
        .select()
        .single();
      
      data = result.data;
      error = result.error;
    }

    if (error) throw error;

    // Atualizar permissões se fornecidas
    if (updateData.permissions && data) {
      await supabase.from('agent_permissions').upsert({
        agent_id: data.id,
        ...updateData.permissions,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'agent_id' });
    }

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
      .from('chat_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('agent_id', id)
      .eq('status', 'active');

    // Verificar também na tabela antiga
    if (count === null) {
      const { count: oldCount } = await supabase
        .from('whatsapp_agent_assignments')
        .select('*', { count: 'exact', head: true })
        .eq('agent_id', id)
        .eq('status', 'active');

      if (oldCount && oldCount > 0) {
        return NextResponse.json({ 
          error: 'Agente possui chats ativos. Transfira ou finalize antes de excluir.' 
        }, { status: 400 });
      }
    } else if (count > 0) {
      return NextResponse.json({ 
        error: 'Agente possui chats ativos. Transfira ou finalize antes de excluir.' 
      }, { status: 400 });
    }

    // Buscar agente para pegar user_id
    const { data: agent } = await supabase
      .from('agents')
      .select('user_id, type')
      .eq('id', id)
      .eq('organization_id', orgId)
      .single();

    // Deletar atribuições e referências
    await supabase.from('chat_assignments').delete().eq('agent_id', id);
    await supabase.from('whatsapp_agent_assignments').delete().eq('agent_id', id);
    await supabase.from('whatsapp_conversations').update({ assigned_agent_id: null }).eq('assigned_agent_id', id);
    await supabase.from('agent_permissions').delete().eq('agent_id', id);
    await supabase.from('ai_agent_configs').delete().eq('agent_id', id);
    
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

    // Se era agente humano com user_id, deletar também do Auth e profiles
    if (agent?.user_id && agent.type === 'human') {
      const adminClient = getAdminClient();
      if (adminClient) {
        // Deletar perfil
        await supabase.from('profiles').delete().eq('id', agent.user_id);
        
        // Deletar usuário do Auth
        try {
          await adminClient.auth.admin.deleteUser(agent.user_id);
        } catch (e) {
          console.warn('Could not delete auth user:', e);
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
