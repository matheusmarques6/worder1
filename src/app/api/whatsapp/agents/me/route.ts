import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseRouteClient, getAuthUser, unauthorizedResponse } from '@/lib/supabase-route';

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseRouteClient();
    const user = await getAuthUser(supabase);
    
    if (!user) {
      return NextResponse.json({ 
        error: 'Não autenticado',
        isAgent: false,
        isAdmin: true,
        permissions: null 
      }, { status: 401 });
    }

    console.log('[/api/whatsapp/agents/me] User:', user.email, 'is_agent:', user.is_agent);
    
    // Se não é agente, é admin
    if (!user.is_agent) {
      return NextResponse.json({
        isAgent: false,
        isAdmin: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.email?.split('@')[0],
        },
        agent: null,
        permissions: null,
      });
    }

    // É agente - buscar dados
    const agentId = user.agent_id;
    
    if (!agentId) {
      return NextResponse.json({ 
        error: 'ID do agente não encontrado',
        isAgent: true,
        isAdmin: false,
        permissions: null 
      }, { status: 400 });
    }

    const { data: agent } = await supabase
      .from('agents')
      .select('*')
      .eq('id', agentId)
      .single();

    const { data: permissions } = await supabase
      .from('agent_permissions')
      .select('*')
      .eq('agent_id', agentId)
      .single();

    const p = permissions || {};
    
    return NextResponse.json({
      isAgent: true,
      isAdmin: false,
      user: {
        id: user.id,
        email: user.email,
        name: agent?.name || user.email?.split('@')[0],
      },
      agent: agent ? {
        id: agent.id,
        name: agent.name,
        email: agent.email,
        role: agent.role,
        status: agent.status,
        organization_id: agent.organization_id,
      } : null,
      permissions: {
        agentId: agentId,
        accessLevel: p.access_level || agent?.role || 'agent',
        canViewAllConversations: p.can_view_all_conversations ?? false,
        canTransferConversations: p.can_transfer_conversations ?? true,
        canUseAiSuggestions: p.can_use_ai_suggestions ?? true,
        canSendMedia: p.can_send_media ?? true,
        canUseQuickReplies: p.can_use_quick_replies ?? true,
        whatsappAccessAll: p.whatsapp_access_all ?? false,
        whatsappNumberIds: p.whatsapp_number_ids || [],
        canViewContactInfo: p.can_view_contact_info ?? true,
        canEditContactInfo: p.can_edit_contact_info ?? false,
        canAddNotes: p.can_add_notes ?? true,
        canViewOrderHistory: p.can_view_order_history ?? true,
        canAccessCrm: p.can_access_crm ?? false,
        canAccessPipelines: p.can_access_pipelines ?? false,
        canCreateDeals: p.can_create_deals ?? false,
        canManageTags: p.can_manage_tags ?? false,
        pipelineAccessAll: p.pipeline_access_all ?? false,
        pipelineIds: p.pipeline_ids || [],
        canViewAnalytics: p.can_view_analytics ?? false,
        canViewReports: p.can_view_reports ?? false,
        maxConcurrentChats: p.max_concurrent_chats ?? 10,
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
