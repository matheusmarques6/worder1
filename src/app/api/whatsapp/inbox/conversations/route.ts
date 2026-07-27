// src/app/api/whatsapp/inbox/conversations/route.ts
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { resolveStoreContext, applyStoreFilter } from '@/lib/api/store-filter';
import { computeCanSendTemplateOnly } from '@/lib/whatsapp/service-window'

export async function GET(request: NextRequest) {
  try {
    const auth = await requireOrgFromAuth(request)
    if (auth instanceof NextResponse) return auth
    const { orgId } = auth

    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const search = searchParams.get('search')
    const rawStoreId = searchParams.get('storeId') || searchParams.get('store_id')

    // Onda 5 — multi-store filter via helper compartilhado.
    // Conversas são 'store-or-org': aparecem na loja escolhida E também as
    // órfãs (store_id NULL) ficam visíveis pra não perder dado legacy.
    const storeCtx = await resolveStoreContext(rawStoreId, orgId, supabase)

    let query = supabase
      .from('whatsapp_inbox_conversations')
      .select('*')
      .eq('organization_id', orgId)
      .order('last_message_at', { ascending: false, nullsFirst: false })

    query = applyStoreFilter(query, storeCtx, 'store-or-org')

    if (status && status !== 'all') {
      query = query.eq('status', status)
    }

    const { data, error } = await query

    if (error) {
      console.error('Conversations query error:', error)
      throw error
    }

    // Onda 13 — a view whatsapp_inbox_conversations NAO expoe ai_enabled/
    // ai_disabled_*. Sem esse merge, todo objeto chegava na UI com
    // is_bot_active=undefined: o botao mostrava 'Bot Off' SEMPRE e o polling
    // de 5s sobrescrevia o toggle otimista ('ativa e volta pra off').
    const cloudIds = (data || [])
      .filter((c: any) => c.provider === 'cloud')
      .map((c: any) => c.id)
    const aiMap = new Map<string, any>()
    if (cloudIds.length > 0) {
      const { data: aiRows } = await supabase
        .from('whatsapp_cloud_conversations')
        .select('id, ai_enabled, ai_disabled_at, ai_disabled_reason')
        .in('id', cloudIds)
      for (const r of aiRows || []) aiMap.set(r.id, r)
    }

    const conversations = (data || []).map((conv: any) =>
      formatConversation(conv, aiMap.get(conv.id)),
    )

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

function formatConversation(conv: any, ai?: any) {
  const phoneNumber = conv.phone_number || conv.contact_phone || ''
  const contactName = conv.contact_name || phoneNumber
  // ai vem da tabela whatsapp_cloud_conversations (merge na GET) — a view
  // unificada nao tem essas colunas. Legacy (evolution) assume IA ligada.
  const aiEnabled = ai?.ai_enabled ?? true

  // Janela de 24h (Meta). A view ja traz is_window_open/window_expires_at;
  // aqui normalizamos: flag do BD pode ficar stale (true com timestamp
  // vencido), entao o horario de expiracao manda.
  const canSendTemplateOnly = computeCanSendTemplateOnly(
    conv.is_window_open,
    conv.window_expires_at,
  )

  return {
    id: conv.id,
    organization_id: conv.organization_id,
    store_id: conv.store_id,
    provider: conv.provider,
    account_id: conv.account_id,
    contact_id: conv.contact_id,

    phone_number: phoneNumber,
    chat_id: conv.chat_id,
    status: conv.status || 'open',

    ai_enabled: aiEnabled,
    is_bot_active: aiEnabled,
    ai_disabled_at: ai?.ai_disabled_at ?? null,
    ai_disabled_reason: ai?.ai_disabled_reason ?? null,

    is_window_open: !canSendTemplateOnly,
    can_send_template_only: canSendTemplateOnly,
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
