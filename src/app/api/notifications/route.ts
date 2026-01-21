import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'

// =============================================
// NOTIFICATIONS API - CORRIGIDA
// =============================================
// Mudanças:
// 1. Resolve user_id e organization_id do TOKEN, não da query
// 2. Aceita parâmetros opcionais na query como override
// 3. Melhor tratamento de erros
// =============================================

// GET - Listar notificações do usuário
export async function GET(request: NextRequest) {
  try {
    // =====================================================
    // CORREÇÃO: Resolver contexto do token PRIMEIRO
    // =====================================================
    const auth = await getAuthClient()
    
    let userId: string | null = null
    let organizationId: string | null = null
    
    if (auth) {
      userId = auth.user.id
      organizationId = auth.user.organization_id
    }
    
    // Query params como fallback/override (para compatibilidade)
    const { searchParams } = new URL(request.url)
    const queryOrgId = searchParams.get('organization_id') || searchParams.get('organizationId')
    const queryUserId = searchParams.get('user_id') || searchParams.get('userId')
    
    // Usar query params se fornecidos (para admin ou testes)
    if (queryOrgId) organizationId = queryOrgId
    if (queryUserId) userId = queryUserId
    
    // Validar
    if (!organizationId || !userId) {
      return NextResponse.json({ 
        error: 'Authentication required. Please login.',
        hint: 'organization_id and user_id could not be resolved from token'
      }, { status: 401 })
    }
    
    // Parâmetros de filtro
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100)
    const offset = parseInt(searchParams.get('offset') || '0')
    const type = searchParams.get('type')
    
    // Buscar notificações
    let query = supabase
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    
    if (unreadOnly) {
      query = query.eq('read', false)
    }
    
    if (type) {
      query = query.eq('type', type)
    }
    
    const { data: notifications, error, count } = await query
    
    if (error) {
      console.error('[Notifications] Error fetching:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Buscar dados do actor para cada notificação
    const actorIds = [...new Set(notifications?.filter(n => n.actor_id).map(n => n.actor_id))]
    let actorMap: Record<string, any> = {}
    
    if (actorIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, first_name, last_name, full_name, avatar_url, email')
        .in('id', actorIds)
      
      profiles?.forEach(p => {
        actorMap[p.id] = {
          id: p.id,
          name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          avatar_url: p.avatar_url
        }
      })
    }
    
    // Adicionar actor aos notifications
    const notificationsWithActor = notifications?.map(n => ({
      ...n,
      actor: n.actor_id ? actorMap[n.actor_id] || null : null
    }))
    
    // Contar não lidas
    const { count: unreadCount } = await supabase
      .from('notifications')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('read', false)
      .eq('dismissed', false)
    
    return NextResponse.json({
      notifications: notificationsWithActor || [],
      total: count || 0,
      unread_count: unreadCount || 0,
      limit,
      offset
    })
    
  } catch (error) {
    console.error('[Notifications] API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Marcar como lida / Dispensar
export async function PATCH(request: NextRequest) {
  try {
    // Resolver contexto do token
    const auth = await getAuthClient()
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    const { user } = auth
    const body = await request.json()
    const { notification_id, action } = body
    
    // Usar org/user do token, não do body
    const organizationId = user.organization_id
    const userId = user.id
    
    // Marcar todas como lidas
    if (action === 'mark_all_read') {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId)
        .eq('organization_id', organizationId)
        .eq('read', false)
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, action: 'mark_all_read' })
    }
    
    // Ações em notificação específica
    if (!notification_id) {
      return NextResponse.json({ error: 'notification_id is required' }, { status: 400 })
    }
    
    const updates: Record<string, any> = {
      updated_at: new Date().toISOString()
    }
    
    switch (action) {
      case 'read':
        updates.read = true
        updates.read_at = new Date().toISOString()
        break
      case 'unread':
        updates.read = false
        updates.read_at = null
        break
      case 'dismiss':
        updates.dismissed = true
        updates.dismissed_at = new Date().toISOString()
        break
      default:
        return NextResponse.json({ error: 'Invalid action. Use: read, unread, dismiss, mark_all_read' }, { status: 400 })
    }
    
    // Atualizar garantindo que pertence ao usuário
    const { data, error } = await supabase
      .from('notifications')
      .update(updates)
      .eq('id', notification_id)
      .eq('user_id', userId) // Segurança: só pode atualizar as próprias
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    if (!data) {
      return NextResponse.json({ error: 'Notification not found or access denied' }, { status: 404 })
    }
    
    return NextResponse.json({ success: true, notification: data })
    
  } catch (error) {
    console.error('[Notifications] PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Criar notificação manual (para uso interno)
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }
    
    const body = await request.json()
    const {
      user_id,        // Destinatário (pode ser outro usuário)
      type,
      title,
      message,
      reference_type,
      reference_id,
      metadata
    } = body
    
    // organization_id do criador
    const organizationId = auth.user.organization_id
    const actorId = auth.user.id
    
    if (!user_id || !type || !title) {
      return NextResponse.json({ 
        error: 'user_id, type and title are required' 
      }, { status: 400 })
    }
    
    // Verificar se o destinatário pertence à mesma organização
    const { data: targetUser } = await supabase
      .from('profiles')
      .select('id, organization_id')
      .eq('id', user_id)
      .eq('organization_id', organizationId)
      .single()
    
    if (!targetUser) {
      return NextResponse.json({ 
        error: 'Target user not found or not in your organization' 
      }, { status: 404 })
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organization_id: organizationId,
        user_id,
        actor_id: actorId,
        type,
        title,
        message,
        reference_type,
        reference_id,
        metadata: metadata || {}
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ notification: data }, { status: 201 })
    
  } catch (error) {
    console.error('[Notifications] POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
