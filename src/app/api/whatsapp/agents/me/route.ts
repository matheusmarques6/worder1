import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

// GET - Buscar dados e permissões do agente logado
export async function GET(request: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    
    // 1. Buscar usuário autenticado
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ 
        error: 'Não autenticado',
        isAgent: false,
        isAdmin: true,
        permissions: null 
      }, { status: 401 });
    }

    console.log('[/api/whatsapp/agents/me] User:', user.email, 'is_agent:', user.user_metadata?.is_agent);
    
    // 2. Se não é agente, é admin - tem acesso total
    if (!user.user_metadata?.is_agent) {
      return NextResponse.json({
        isAgent: false,
        isAdmin: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.user_metadata?.name || user.email?.split('@')[0],
        },
        agent: null,
        permissions: null, // Admin não precisa de permissões específicas
      });
    }

    // 3. É agente - buscar dados e permissões
    const agentId = user.user_metadata.agent_id;
    
    if (!agentId) {
      return NextResponse.json({ 
        error: 'ID do agente não encontrado',
        isAgent: true,
        isAdmin: false,
        permissions: null 
      }, { status: 400 });
    }

    // 4. Buscar dados do agente
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    if (agentError) {
      console.error('[/api/whatsapp/agents/me] Erro ao buscar agente:', agentError);
    }

    // 5. Buscar permissões do agente
    const { data: permissions, error: permError } = await supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (permError && permError.code !== 'PGRST116') {
      console.error('[/api/whatsapp/agents/me] Erro ao buscar permissões:', permError);
    }

    // 6. Montar resposta com permissões (ou defaults se não existirem)
    const p = permissions || {};
    
    return NextResponse.json({
      isAgent: true,
      isAdmin: false,
      user: {
        id: user.id,
        email: user.email,
        name: user.user_metadata?.name || agent?.name || user.email?.split('@')[0],
      },
      agent: agent ? {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role, // 'agent' | 'supervisor' | 'admin'
        status: agent.status,
        organization_id: agent.organization_id,
      } : null,
      permissions: {
        // Identificação
        agentId: agentId,
        
        // Nível de acesso geral
        accessLevel: p.access_level || agent?.role || 'agent',
        
        // Conversas/WhatsApp
        canViewAllConversations: p.can_view_all_conversations ?? false,
        canTransferConversations: p.can_transfer_conversations ?? true,
        canUseAiSuggestions: p.can_use_ai_suggestions ?? true,
        canSendMedia: p.can_send_media ?? true,
        canUseQuickReplies: p.can_use_quick_replies ?? true,
        
        // WhatsApp - Números permitidos
        whatsappAccessAll: p.whatsapp_access_all ?? false,
        whatsappNumberIds: p.whatsapp_number_ids || [],
        
        // Contatos
        canViewContactInfo: p.can_view_contact_info ?? true,
        canEditContactInfo: p.can_edit_contact_info ?? false,
        canAddNotes: p.can_add_notes ?? true,
        canViewOrderHistory: p.can_view_order_history ?? true,
        
        // CRM
        canAccessCrm: p.can_access_crm ?? false,
        canAccessPipelines: p.can_access_pipelines ?? false,
        canCreateDeals: p.can_create_deals ?? false,
        canManageTags: p.can_manage_tags ?? false,
        
        // Pipelines específicos
        pipelineAccessAll: p.pipeline_access_all ?? false,
        pipelineIds: p.pipeline_ids || [],
        
        // Analytics
        canViewAnalytics: p.can_view_analytics ?? false,
        canViewReports: p.can_view_reports ?? false,
        
        // Limites
        maxConcurrentChats: p.max_concurrent_chats ?? 10,
        
        // Horários permitidos
        allowedHoursStart: p.allowed_hours_start || null,
        allowedHoursEnd: p.allowed_hours_end || null,
        allowedDays: p.allowed_days || null,
      },
    });

  } catch (error: any) {
    console.error('[/api/whatsapp/agents/me] Erro:', error);
    return NextResponse.json({ 
      error: error.message,
      isAgent: false,
      isAdmin: false,
      permissions: null 
    }, { status: 500 });
  }
}
