import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET - List conversations
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const accountId = searchParams.get('account_id')
    const status = searchParams.get('status') || 'open'
    const assignedTo = searchParams.get('assigned_to')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')
    const search = searchParams.get('search')

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    let query = supabase
      .from('instagram_conversations')
      .select(`
        *,
        account:instagram_accounts(id, username, profile_picture_url),
        contact:instagram_contacts(id, username, name, profile_picture_url),
        assigned_user:profiles!instagram_conversations_assigned_to_fkey(id, full_name, avatar_url)
      `, { count: 'exact' })
      .eq('organization_id', membership.organization_id)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (accountId) {
      query = query.eq('account_id', accountId)
    }

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    if (assignedTo) {
      if (assignedTo === 'unassigned') {
        query = query.is('assigned_to', null)
      } else {
        query = query.eq('assigned_to', assignedTo)
      }
    }

    if (search) {
      query = query.or(`username.ilike.%${search}%,contact_name.ilike.%${search}%`)
    }

    const { data, error, count } = await query

    if (error) {
      console.error('Error fetching conversations:', error)
      return NextResponse.json({ error: 'Failed to fetch conversations' }, { status: 500 })
    }

    return NextResponse.json({
      conversations: data || [],
      total: count || 0,
      limit,
      offset,
    })
  } catch (error) {
    console.error('Instagram conversations error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// PATCH - Update conversation (assign, close, etc)
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { conversation_id, ...updates } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()

    if (!membership) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 })
    }

    // Verify conversation belongs to organization
    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select('id')
      .eq('id', conversation_id)
      .eq('organization_id', membership.organization_id)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Allowed updates
    const allowedUpdates: any = {}
    if ('status' in updates) allowedUpdates.status = updates.status
    if ('assigned_to' in updates) allowedUpdates.assigned_to = updates.assigned_to
    if ('ai_enabled' in updates) allowedUpdates.ai_enabled = updates.ai_enabled
    if ('is_bot_active' in updates) allowedUpdates.is_bot_active = updates.is_bot_active
    if ('tags' in updates) allowedUpdates.tags = updates.tags
    if ('notes' in updates) allowedUpdates.notes = updates.notes
    if ('unread_count' in updates) allowedUpdates.unread_count = updates.unread_count

    allowedUpdates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('instagram_conversations')
      .update(allowedUpdates)
      .eq('id', conversation_id)
      .select()
      .single()

    if (error) {
      console.error('Error updating conversation:', error)
      return NextResponse.json({ error: 'Failed to update conversation' }, { status: 500 })
    }

    return NextResponse.json({ conversation: data })
  } catch (error) {
    console.error('Instagram conversation update error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
