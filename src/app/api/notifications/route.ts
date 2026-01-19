import { supabaseAdmin as supabase } from '@/lib/supabase-admin'
import { NextRequest, NextResponse } from 'next/server'

// GET - Listar notificações do usuário
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organization_id')
    const userId = searchParams.get('user_id')
    const unreadOnly = searchParams.get('unread_only') === 'true'
    const limit = parseInt(searchParams.get('limit') || '20')
    const offset = parseInt(searchParams.get('offset') || '0')
    const type = searchParams.get('type')
    
    if (!organizationId || !userId) {
      return NextResponse.json({ error: 'organization_id and user_id are required' }, { status: 400 })
    }
    
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
      console.error('Error fetching notifications:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    // Buscar dados do actor para cada notificação
    const actorIds = [...new Set(notifications?.filter(n => n.actor_id).map(n => n.actor_id))]
    let actorMap: Record<string, any> = {}
    
    if (actorIds.length > 0) {
      const { data: members } = await supabase
        .from('organization_members')
        .select('user_id, users:user_id(id, name, email, avatar_url)')
        .eq('organization_id', organizationId)
        .in('user_id', actorIds)
      
      members?.forEach(m => {
        if (m.users) {
          actorMap[m.user_id] = m.users
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
      notifications: notificationsWithActor,
      total: count || 0,
      unread_count: unreadCount || 0,
      limit,
      offset
    })
    
  } catch (error) {
    console.error('Notifications API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Marcar como lida / Dispensar
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { notification_id, organization_id, user_id, action } = body
    
    // Marcar todas como lidas
    if (action === 'mark_all_read' && organization_id && user_id) {
      const { error } = await supabase
        .from('notifications')
        .update({ 
          read: true, 
          read_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('user_id', user_id)
        .eq('organization_id', organization_id)
        .eq('read', false)
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      
      return NextResponse.json({ success: true, action: 'mark_all_read' })
    }
    
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
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .update(updates)
      .eq('id', notification_id)
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ success: true, notification: data })
    
  } catch (error) {
    console.error('Notifications PATCH error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Criar notificação manual
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      organization_id,
      user_id,
      type,
      title,
      message,
      reference_type,
      reference_id,
      actor_id,
      metadata
    } = body
    
    if (!organization_id || !user_id || !type || !title) {
      return NextResponse.json({ 
        error: 'organization_id, user_id, type and title are required' 
      }, { status: 400 })
    }
    
    const { data, error } = await supabase
      .from('notifications')
      .insert({
        organization_id,
        user_id,
        type,
        title,
        message,
        reference_type,
        reference_id,
        actor_id,
        metadata: metadata || {}
      })
      .select()
      .single()
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    
    return NextResponse.json({ notification: data }, { status: 201 })
    
  } catch (error) {
    console.error('Notifications POST error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
