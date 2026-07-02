import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { createInstagramClient } from '@/lib/instagram/api'

// GET - Get messages for a conversation
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const { supabase, user } = auth
    const organizationId = user.organization_id

    const searchParams = request.nextUrl.searchParams
    const conversationId = searchParams.get('conversation_id')
    const limit = parseInt(searchParams.get('limit') || '50')
    const before = searchParams.get('before') // cursor for pagination

    if (!conversationId) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    // Verify conversation belongs to organization
    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select('id, account_id, participant_id')
      .eq('id', conversationId)
      .eq('organization_id', organizationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Build query
    let query = supabase
      .from('instagram_messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('timestamp', { ascending: false })
      .limit(limit)

    if (before) {
      query = query.lt('timestamp', before)
    }

    const { data: messages, error } = await query

    if (error) {
      console.error('Error fetching messages:', error)
      return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
    }

    // Mark conversation as read
    await supabase
      .from('instagram_conversations')
      .update({ unread_count: 0 })
      .eq('id', conversationId)

    return NextResponse.json({
      messages: (messages || []).reverse(), // Return in chronological order
      has_more: messages?.length === limit,
    })
  } catch (error) {
    console.error('Instagram messages error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST - Send a message
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const { supabase, user } = auth
    const organizationId = user.organization_id

    const body = await request.json()
    const { conversation_id, message_type = 'text', text, media_url } = body

    if (!conversation_id) {
      return NextResponse.json({ error: 'conversation_id is required' }, { status: 400 })
    }

    if (message_type === 'text' && !text) {
      return NextResponse.json({ error: 'text is required for text messages' }, { status: 400 })
    }

    if (['image', 'video', 'audio', 'file'].includes(message_type) && !media_url) {
      return NextResponse.json({ error: 'media_url is required for media messages' }, { status: 400 })
    }

    // Get conversation with account details
    const { data: conversation } = await supabase
      .from('instagram_conversations')
      .select(`
        *,
        account:instagram_accounts(*)
      `)
      .eq('id', conversation_id)
      .eq('organization_id', organizationId)
      .single()

    if (!conversation) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    }

    // Check if messaging window is open (24h rule)
    if (!conversation.is_window_open || new Date(conversation.window_expires_at) < new Date()) {
      return NextResponse.json({
        error: 'Messaging window expired. Customer must send a message first.',
        code: 'WINDOW_EXPIRED',
      }, { status: 400 })
    }

    const account = conversation.account

    // Create Instagram API client
    const instagramClient = createInstagramClient({
      instagramBusinessId: account.instagram_business_id,
      pageId: account.page_id,
      accessToken: account.access_token,
    })

    // Send message via Instagram API
    let result
    const recipientId = conversation.participant_id

    try {
      switch (message_type) {
        case 'text':
          result = await instagramClient.sendText(recipientId, text)
          break
        case 'image':
          result = await instagramClient.sendImage(recipientId, media_url)
          break
        case 'video':
          result = await instagramClient.sendVideo(recipientId, media_url)
          break
        case 'audio':
          result = await instagramClient.sendAudio(recipientId, media_url)
          break
        case 'file':
          result = await instagramClient.sendFile(recipientId, media_url)
          break
        default:
          return NextResponse.json({ error: 'Unsupported message type' }, { status: 400 })
      }
    } catch (apiError: any) {
      console.error('Instagram API error:', apiError)

      // Check for specific errors
      if (apiError.isWindowExpired?.()) {
        // Update conversation window status
        await supabase
          .from('instagram_conversations')
          .update({ is_window_open: false })
          .eq('id', conversation_id)

        return NextResponse.json({
          error: 'Messaging window expired. Customer must send a message first.',
          code: 'WINDOW_EXPIRED',
        }, { status: 400 })
      }

      return NextResponse.json({
        error: apiError.message || 'Failed to send message',
        code: apiError.code,
      }, { status: 500 })
    }

    // Save message to database
    const messageId = result.message_id
    const now = new Date()

    const { data: message, error: insertError } = await supabase
      .from('instagram_messages')
      .insert({
        organization_id: organizationId,
        store_id: conversation.store_id,
        account_id: account.id,
        conversation_id: conversation_id,
        message_id: messageId,
        direction: 'outbound',
        from_user_id: account.instagram_business_id,
        to_user_id: recipientId,
        message_type,
        text_body: text || null,
        content: { text, media_url },
        media_url: media_url || null,
        status: 'sent',
        timestamp: now.toISOString(),
        sent_at: now.toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error saving message:', insertError)
      // Message was sent but not saved - still return success
    }

    return NextResponse.json({
      success: true,
      message_id: messageId,
      message: message || { id: messageId },
    })
  } catch (error) {
    console.error('Instagram send message error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
