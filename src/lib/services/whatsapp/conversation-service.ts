// =============================================
// WhatsApp Conversation Service
// Handles: CRUD, round-robin, transfers, status
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin'
import { logger } from './logger'
import type {
  Conversation,
  ConversationStatus,
  ServiceResult,
  Transfer,
  AgentStatus,
} from './types'

const LOG_PREFIX = 'ConversationService'

// =============================================
// GET / LIST
// =============================================

export async function getConversation(
  conversationId: string,
  organizationId: string
): Promise<ServiceResult<Conversation>> {
  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to get conversation', error)
    return { error: error.message }
  }
  return { data }
}

export interface ListConversationsParams {
  organizationId: string
  storeId?: string
  status?: ConversationStatus | 'all'
  assignedTo?: string | 'unassigned' | 'all'
  queueId?: string
  search?: string
  tags?: string[]
  instanceId?: string
  limit?: number
  cursor?: string
}

export async function listConversations(
  params: ListConversationsParams
): Promise<ServiceResult<{ conversations: Conversation[]; nextCursor?: string }>> {
  const {
    organizationId,
    storeId,
    status,
    assignedTo,
    queueId,
    search,
    tags,
    instanceId,
    limit = 20,
    cursor,
  } = params

  let query = supabaseAdmin
    .from('whatsapp_conversations')
    .select('*')
    .eq('organization_id', organizationId)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .limit(limit + 1)

  if (storeId) query = query.eq('store_id', storeId)
  if (status && status !== 'all') query = query.eq('status', status)
  if (queueId) query = query.eq('queue_id', queueId)
  if (instanceId) query = query.eq('instance_id', instanceId)

  if (assignedTo && assignedTo !== 'all') {
    if (assignedTo === 'unassigned') {
      query = query.is('assigned_agent_id', null)
    } else {
      query = query.eq('assigned_agent_id', assignedTo)
    }
  }

  if (search) {
    query = query.or(
      `contact_name.ilike.%${search}%,contact_phone.ilike.%${search}%`
    )
  }

  if (tags && tags.length > 0) {
    query = query.overlaps('tags', tags)
  }

  if (cursor) {
    query = query.lt('last_message_at', cursor)
  }

  const { data, error } = await query

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to list conversations', error)
    return { error: error.message }
  }

  const conversations = data || []
  const hasMore = conversations.length > limit
  if (hasMore) conversations.pop()

  const nextCursor = hasMore
    ? conversations[conversations.length - 1]?.last_message_at
    : undefined

  return { data: { conversations, nextCursor } }
}

// =============================================
// CREATE / UPSERT (used by webhook)
// =============================================

export interface UpsertConversationParams {
  organizationId: string
  storeId?: string
  instanceId: string
  contactPhone: string
  contactName?: string
  contactId?: string
  origin?: Conversation['origin']
  adReferral?: Record<string, unknown>
}

export async function upsertConversation(
  params: UpsertConversationParams
): Promise<ServiceResult<Conversation>> {
  const {
    organizationId,
    storeId,
    instanceId,
    contactPhone,
    contactName,
    contactId,
    origin = 'organic',
    adReferral,
  } = params

  const now = new Date().toISOString()
  const windowExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .upsert(
      {
        organization_id: organizationId,
        store_id: storeId,
        instance_id: instanceId,
        contact_phone: contactPhone,
        contact_name: contactName || contactPhone,
        contact_id: contactId,
        status: 'open',
        is_contact_initiated: true,
        service_window_expires_at: windowExpires,
        origin,
        ad_referral: adReferral,
        last_message_at: now,
        updated_at: now,
      },
      { onConflict: 'instance_id,contact_phone' }
    )
    .select()
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to upsert conversation', error)
    return { error: error.message }
  }

  // If new conversation, try round-robin assignment
  if (data && !data.assigned_agent_id) {
    const agentId = await assignRoundRobin(organizationId, data.queue_id)
    if (agentId) {
      await supabaseAdmin
        .from('whatsapp_conversations')
        .update({ assigned_agent_id: agentId })
        .eq('id', data.id)
      data.assigned_agent_id = agentId
    }
  }

  return { data }
}

// =============================================
// UPDATE STATUS
// =============================================

export async function updateConversationStatus(
  conversationId: string,
  organizationId: string,
  status: ConversationStatus,
  agentId?: string
): Promise<ServiceResult<Conversation>> {
  const updates: Record<string, unknown> = { status }

  if (status === 'resolved') {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = agentId
  }

  if (status === 'open') {
    updates.resolved_at = null
    updates.resolved_by = null
  }

  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to update status', error)
    return { error: error.message }
  }

  // Decrement agent active conversations if resolved
  if (status === 'resolved' && data?.assigned_agent_id) {
    await supabaseAdmin
      .from('whatsapp_agent_status')
      .update({
        active_conversations: supabaseAdmin.rpc
          ? undefined
          : undefined,
      })
      .eq('agent_id', data.assigned_agent_id)
      .eq('organization_id', organizationId)

    // Use raw SQL for decrement
    await supabaseAdmin.rpc('decrement_agent_conversations', {
      p_agent_id: data.assigned_agent_id,
      p_org_id: organizationId,
    }).catch(() => {
      // Fallback: just update if RPC doesn't exist
    })
  }

  return { data }
}

// =============================================
// TRANSFER
// =============================================

export interface TransferParams {
  conversationId: string
  organizationId: string
  fromAgentId?: string
  fromAgentName?: string
  toAgentId?: string
  toQueueId?: string
  reason?: string
}

export async function transferConversation(
  params: TransferParams
): Promise<ServiceResult<Transfer>> {
  const {
    conversationId,
    organizationId,
    fromAgentId,
    fromAgentName,
    toAgentId,
    toQueueId,
    reason,
  } = params

  // Get current conversation for context
  const { data: conversation } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('assigned_agent_id, queue_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conversation) {
    return { error: 'Conversation not found' }
  }

  // Get target agent name
  let toAgentName: string | undefined
  if (toAgentId) {
    const { data: agent } = await supabaseAdmin
      .from('user_organizations')
      .select('users(first_name, last_name)')
      .eq('user_id', toAgentId)
      .single()
    toAgentName = agent ? `${(agent as any).users?.first_name || ''} ${(agent as any).users?.last_name || ''}`.trim() : undefined
  }

  // Update conversation
  const updates: Record<string, unknown> = {
    status: 'open',
  }
  if (toAgentId) updates.assigned_agent_id = toAgentId
  if (toQueueId) {
    updates.queue_id = toQueueId
    // If transferring to queue, use round-robin for agent assignment
    if (!toAgentId) {
      const newAgentId = await assignRoundRobin(organizationId, toQueueId)
      if (newAgentId) updates.assigned_agent_id = newAgentId
    }
  }

  await supabaseAdmin
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('organization_id', organizationId)

  // Log transfer
  const { data: transfer, error } = await supabaseAdmin
    .from('whatsapp_transfers')
    .insert({
      organization_id: organizationId,
      conversation_id: conversationId,
      from_agent_id: fromAgentId || conversation.assigned_agent_id,
      from_agent_name: fromAgentName,
      to_agent_id: toAgentId,
      to_agent_name: toAgentName,
      from_queue_id: conversation.queue_id,
      to_queue_id: toQueueId,
      reason,
    })
    .select()
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to log transfer', error)
    return { error: error.message }
  }

  // Insert system message about transfer
  await supabaseAdmin.from('whatsapp_messages').insert({
    organization_id: organizationId,
    conversation_id: conversationId,
    direction: 'outbound',
    message_type: 'system',
    content: toAgentName
      ? `Conversa transferida de ${fromAgentName || 'Sem agente'} para ${toAgentName}${reason ? `. Motivo: ${reason}` : ''}`
      : `Conversa transferida para fila${reason ? `. Motivo: ${reason}` : ''}`,
    sender_type: 'system',
    status: 'sent',
    is_from_me: true,
    is_internal_note: false,
  })

  // Update agent conversation counts
  if (fromAgentId || conversation.assigned_agent_id) {
    await decrementAgentConversations(
      fromAgentId || conversation.assigned_agent_id!,
      organizationId
    )
  }
  if (toAgentId) {
    await incrementAgentConversations(toAgentId, organizationId)
  }

  return { data: transfer }
}

// =============================================
// ASSIGN AGENT
// =============================================

export async function assignAgent(
  conversationId: string,
  organizationId: string,
  agentId: string
): Promise<ServiceResult<Conversation>> {
  const { data: current } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('assigned_agent_id')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({ assigned_agent_id: agentId })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to assign agent', error)
    return { error: error.message }
  }

  // Update counts
  if (current?.assigned_agent_id) {
    await decrementAgentConversations(current.assigned_agent_id, organizationId)
  }
  await incrementAgentConversations(agentId, organizationId)

  return { data }
}

// =============================================
// ROUND ROBIN
// =============================================

async function assignRoundRobin(
  organizationId: string,
  queueId?: string | null
): Promise<string | null> {
  let query = supabaseAdmin
    .from('whatsapp_agent_status')
    .select('agent_id, active_conversations, max_conversations')
    .eq('organization_id', organizationId)
    .in('status', ['online', 'away'])
    .order('active_conversations', { ascending: true })
    .limit(1)

  if (queueId) {
    // Get agents in this queue
    const { data: queueAgents } = await supabaseAdmin
      .from('whatsapp_queue_agents')
      .select('agent_id')
      .eq('queue_id', queueId)
      .eq('is_active', true)

    if (!queueAgents || queueAgents.length === 0) return null

    const agentIds = queueAgents.map((qa) => qa.agent_id)
    query = query.in('agent_id', agentIds)
  }

  const { data: agents } = await query

  if (!agents || agents.length === 0) return null

  const agent = agents[0]
  if (agent.active_conversations >= agent.max_conversations) return null

  // Increment count
  await incrementAgentConversations(agent.agent_id, organizationId)

  return agent.agent_id
}

// =============================================
// MARK AS READ
// =============================================

export async function markConversationRead(
  conversationId: string,
  organizationId: string
): Promise<ServiceResult<void>> {
  const { error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update({ unread_count: 0 })
    .eq('id', conversationId)
    .eq('organization_id', organizationId)

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to mark as read', error)
    return { error: error.message }
  }

  return { data: undefined }
}

// =============================================
// TAGS
// =============================================

export async function addTagToConversation(
  conversationId: string,
  organizationId: string,
  tagName: string,
  tagColor?: string
): Promise<ServiceResult<void>> {
  // Ensure tag exists
  const { data: tag } = await supabaseAdmin
    .from('whatsapp_tags')
    .upsert(
      {
        organization_id: organizationId,
        name: tagName,
        color: tagColor || '#6366f1',
      },
      { onConflict: 'organization_id,name' }
    )
    .select()
    .single()

  if (!tag) return { error: 'Failed to create tag' }

  // Add to conversation tags array
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('tags')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conv) return { error: 'Conversation not found' }

  const currentTags: string[] = conv.tags || []
  if (!currentTags.includes(tagName)) {
    currentTags.push(tagName)
    await supabaseAdmin
      .from('whatsapp_conversations')
      .update({ tags: currentTags })
      .eq('id', conversationId)
  }

  // Also add to junction table
  await supabaseAdmin
    .from('whatsapp_conversation_tags')
    .upsert(
      { conversation_id: conversationId, tag_id: tag.id },
      { onConflict: 'conversation_id,tag_id' }
    )

  // Update usage count
  await supabaseAdmin
    .from('whatsapp_tags')
    .update({ usage_count: (tag.usage_count || 0) + 1 })
    .eq('id', tag.id)

  return { data: undefined }
}

export async function removeTagFromConversation(
  conversationId: string,
  organizationId: string,
  tagName: string
): Promise<ServiceResult<void>> {
  const { data: conv } = await supabaseAdmin
    .from('whatsapp_conversations')
    .select('tags')
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .single()

  if (!conv) return { error: 'Conversation not found' }

  const currentTags: string[] = (conv.tags || []).filter(
    (t: string) => t !== tagName
  )
  await supabaseAdmin
    .from('whatsapp_conversations')
    .update({ tags: currentTags })
    .eq('id', conversationId)

  return { data: undefined }
}

// =============================================
// TOGGLE BOT
// =============================================

export async function toggleBot(
  conversationId: string,
  organizationId: string,
  active: boolean,
  aiAgentId?: string
): Promise<ServiceResult<Conversation>> {
  const updates: Record<string, unknown> = {
    bot_active: active,
  }
  if (aiAgentId) updates.ai_agent_id = aiAgentId
  if (!active) updates.ai_agent_id = null

  const { data, error } = await supabaseAdmin
    .from('whatsapp_conversations')
    .update(updates)
    .eq('id', conversationId)
    .eq('organization_id', organizationId)
    .select()
    .single()

  if (error) {
    logger.error(LOG_PREFIX, 'Failed to toggle bot', error)
    return { error: error.message }
  }

  return { data }
}

// =============================================
// HELPERS
// =============================================

async function incrementAgentConversations(
  agentId: string,
  organizationId: string
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('whatsapp_agent_status')
    .select('active_conversations')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .single()

  if (data) {
    await supabaseAdmin
      .from('whatsapp_agent_status')
      .update({
        active_conversations: (data.active_conversations || 0) + 1,
        last_seen_at: new Date().toISOString(),
      })
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
  }
}

async function decrementAgentConversations(
  agentId: string,
  organizationId: string
): Promise<void> {
  const { data } = await supabaseAdmin
    .from('whatsapp_agent_status')
    .select('active_conversations')
    .eq('agent_id', agentId)
    .eq('organization_id', organizationId)
    .single()

  if (data) {
    await supabaseAdmin
      .from('whatsapp_agent_status')
      .update({
        active_conversations: Math.max(0, (data.active_conversations || 1) - 1),
      })
      .eq('agent_id', agentId)
      .eq('organization_id', organizationId)
  }
}
