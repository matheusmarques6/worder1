// src/app/api/whatsapp/inbox/conversations/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')

    let query = supabase
      .from('whatsapp_inbox_conversations')
      .select('*')
      .eq('organization_id', orgId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Conversations query error:', error)
      throw error
    }

    const conversations = (data || []).map((conv: any) => formatConversation(conv))

    let filteredConversations = conversations
    if (search) {
      const searchLower = search.toLowerCase()
      filteredConversations = conversations.filter((conv: any) =>
        conv.contact_name?.toLowerCase().includes(searchLower) ||
        conv.phone_number?.includes(search)
      )
    }

    return NextResponse.json(
      { conversations: filteredConversations },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  } catch (error: any) {
    console.error('Error fetching conversations:', error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    )
  }
}

function formatConversation(conv: any) {
  const phoneNumber = conv.phone_number || conv.contact_phone || ''
  const contactName = conv.contact_name || phoneNumber

  return {
    id: conv.id,
    organization_id: conv.organization_id,
    provider: conv.provider,
    account_id: conv.account_id,
    contact_id: conv.contact_id,

    phone_number: phoneNumber,
    chat_id: conv.chat_id,
    status: conv.status || 'open',

    is_window_open: conv.is_window_open ?? false,
    window_expires_at: conv.window_expires_at,
    last_customer_message_at: conv.last_customer_message_at,

    assigned_to: conv.assigned_to,

    last_message_at: conv.last_message_at,
    last_message_preview: conv.last_message_preview,
    last_message_direction: conv.last_message_direction,
    unread_count: conv.unread_count || 0,

    contact_name: contactName,
    contact_avatar: conv.profile_picture,

    created_at: conv.created_at,
    updated_at: conv.updated_at,
  }
}
