import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { canRoleAccess } from '@/lib/auth/permissions';


export const dynamic = 'force-dynamic';

// GET - Buscar dados e permissões do agente logado
export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return NextResponse.json({ ...(await auth.json()), isAdmin: false, permissions: null }, { status: auth.status });
    const supabase = supabaseAdmin;
    const { data: profile, error: profileError } = await supabase.from('profiles')
      .select('email, first_name, full_name').eq('id', auth.userId).single();
    if (profileError || !profile) return NextResponse.json({ error: 'Perfil indisponível', isAdmin: false, permissions: null }, { status: 503 });
    const user = { id: auth.userId, email: profile.email, user_metadata: { name: profile.full_name || profile.first_name } };
    if (auth.role !== 'agent') {
      const isAdmin = canRoleAccess(auth.role, 'org:members:role:change');
      return NextResponse.json({ isAgent: false, isAdmin, user: { id: user.id, email: user.email, name: user.user_metadata.name }, agent: null,
        permissions: isAdmin ? null : {
          accessLevel: auth.role, canViewAllConversations: true, whatsappAccessAll: true,
          canTransferConversations: canRoleAccess(auth.role, 'inbox:assign'),
          canSendMedia: canRoleAccess(auth.role, 'inbox:reply'),
          canUseQuickReplies: canRoleAccess(auth.role, 'inbox:reply'),
          canUseAiSuggestions: canRoleAccess(auth.role, 'inbox:reply'),
          canViewContactInfo: canRoleAccess(auth.role, 'contacts:view'),
          canEditContactInfo: canRoleAccess(auth.role, 'contacts:edit'),
          canAccessCrm: canRoleAccess(auth.role, 'crm:view'),
          canAccessPipelines: canRoleAccess(auth.role, 'crm:view'),
          canCreateDeals: canRoleAccess(auth.role, 'crm:edit'),
          canViewAnalytics: canRoleAccess(auth.role, 'analytics:view'),
          canViewReports: canRoleAccess(auth.role, 'reports:view'),
        },
      });
    }
    const agentId = auth.agentId;
    if (!agentId) return NextResponse.json({ error: 'Agente não encontrado', isAgent: true, isAdmin: false, permissions: null }, { status: 403 });

    // 4. Buscar dados do agente
    let { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .eq('organization_id', auth.orgId)
      .eq('user_id', auth.userId)
      .eq('is_active', true)
      .single();

    if (['42P01', 'PGRST205'].includes(agentError?.code || '') || (!agentError && !agent)) {
      const legacy = await supabase.from('whatsapp_agents').select('*').eq('id', agentId)
        .eq('organization_id', auth.orgId).eq('user_id', auth.userId).eq('is_active', true).single();
      agent = legacy.data; agentError = legacy.error;
    }

    if (agentError) {
      console.error('[/api/whatsapp/agents/me] Erro ao buscar agente:', agentError);
      return NextResponse.json(
        { error: 'Erro ao buscar agente', isAgent: true, isAdmin: false, permissions: null },
        { status: 500 },
      );
    }
    if (!agent) {
      return NextResponse.json(
        { error: 'Agente não encontrado', isAgent: true, isAdmin: false, permissions: null },
        { status: 404 },
      );
    }

    // 5. Buscar permissões do agente
    const { data: permissions, error: permError } = await supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    if (permError && permError.code !== 'PGRST116') {
      console.error('[/api/whatsapp/agents/me] Erro ao buscar permissões:', permError);
      return NextResponse.json(
        { error: 'Erro ao buscar permissões', isAgent: true, isAdmin: false, permissions: null },
        { status: 500 },
      );
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
