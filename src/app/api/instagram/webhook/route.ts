import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  parseWebhookPayload,
  extractMessaging,
  isEchoMessage,
  isDeletedMessage,
  getMessageType,
  extractMessageText,
  extractMediaUrl,
  isStoryMention,
  isStoryReply,
  getStoryInfo,
  verifyWebhookSignature,
  WebhookMessaging,
} from '@/lib/instagram/api'

const META_APP_SECRET = process.env.META_APP_SECRET!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// GET - Webhook verification (Meta challenge)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const mode = searchParams.get('hub.mode')
  const token = searchParams.get('hub.verify_token')
  const challenge = searchParams.get('hub.challenge')

  // For Instagram, we use a global verify token
  const VERIFY_TOKEN = process.env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN || 'worder_instagram_verify'

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Instagram webhook verified')
    return new NextResponse(challenge, { status: 200 })
  }

  return new NextResponse('Forbidden', { status: 403 })
}

// POST - Receive webhook events
export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-hub-signature-256') || ''

    // Verify signature
    if (META_APP_SECRET && signature) {
      const isValid = await verifyWebhookSignature(rawBody, signature, META_APP_SECRET)
      if (!isValid) {
        console.error('Invalid Instagram webhook signature')
        return new NextResponse('Invalid signature', { status: 401 })
      }
    }

    const body = JSON.parse(rawBody)

    // Only process Instagram events
    if (body.object !== 'instagram') {
      return NextResponse.json({ received: true })
    }

    // Create Supabase client with service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

    // Process each entry
    const entries = parseWebhookPayload(body)

    for (const entry of entries) {
      const pageId = entry.id
      const messagingEvents = extractMessaging(entry)

      // Find the Instagram account by page ID
      const { data: account, error: accountError } = await supabase
        .from('instagram_accounts')
        .select('*')
        .eq('page_id', pageId)
        .eq('status', 'active')
        .single()

      if (accountError || !account) {
        console.log(`No active Instagram account found for page ${pageId}`)
        continue
      }

      // Process each messaging event
      for (const messaging of messagingEvents) {
        await processMessaging(supabase, account, messaging)
      }
    }

    return NextResponse.json({ received: true })
  } catch (error) {
    console.error('Instagram webhook error:', error)
    // Always return 200 to acknowledge receipt
    return NextResponse.json({ received: true, error: String(error) })
  }
}

async function processMessaging(supabase: any, account: any, messaging: WebhookMessaging) {
  try {
    const senderId = messaging.sender.id
    const recipientId = messaging.recipient.id
    const timestamp = new Date(messaging.timestamp)

    // Skip echo messages (messages sent by the business)
    if (isEchoMessage(messaging)) {
      // Update message status if needed
      if (messaging.message?.mid) {
        await supabase
          .from('instagram_messages')
          .update({ status: 'sent', sent_at: timestamp.toISOString() })
          .eq('message_id', messaging.message.mid)
      }
      return
    }

    // Skip deleted messages
    if (isDeletedMessage(messaging)) {
      return
    }

    // Handle read receipts
    if (messaging.read) {
      await handleReadReceipt(supabase, account, messaging)
      return
    }

    // Handle reactions
    if (messaging.reaction) {
      await handleReaction(supabase, account, messaging)
      return
    }

    // Handle regular messages
    if (messaging.message) {
      await handleMessage(supabase, account, messaging, timestamp)
    }

    // Handle postbacks
    if (messaging.postback) {
      await handlePostback(supabase, account, messaging, timestamp)
    }
  } catch (error) {
    console.error('Error processing Instagram messaging:', error)
  }
}

async function handleMessage(supabase: any, account: any, messaging: WebhookMessaging, timestamp: Date) {
  const senderId = messaging.sender.id
  const messageId = messaging.message!.mid
  const messageType = getMessageType(messaging)
  const textBody = extractMessageText(messaging)
  const mediaUrl = extractMediaUrl(messaging)

  // Find or create Instagram contact
  const { data: contact } = await supabase
    .from('instagram_contacts')
    .upsert({
      organization_id: account.organization_id,
      store_id: account.store_id,
      instagram_user_id: senderId,
      instagram_scoped_id: senderId,
      source: 'instagram_dm',
      last_message_at: timestamp.toISOString(),
    }, {
      onConflict: 'organization_id,instagram_user_id',
    })
    .select()
    .single()

  // Find or create conversation using the RPC function
  const { data: conversationId } = await supabase.rpc('upsert_instagram_conversation', {
    p_organization_id: account.organization_id,
    p_store_id: account.store_id,
    p_account_id: account.id,
    p_participant_id: senderId,
    p_username: null,
    p_contact_name: null,
    p_profile_picture_url: null,
  })

  // Build message content
  const content: any = {}

  if (messaging.message?.text) {
    content.text = messaging.message.text
  }

  if (messaging.message?.attachments) {
    content.attachments = messaging.message.attachments
  }

  if (isStoryReply(messaging)) {
    const storyInfo = getStoryInfo(messaging)
    content.story_reply = storyInfo
  }

  if (isStoryMention(messaging)) {
    content.story_mention = true
    if (messaging.message?.attachments?.[0]?.payload?.url) {
      content.story_url = messaging.message.attachments[0].payload.url
    }
  }

  // Insert message
  const { error: messageError } = await supabase
    .from('instagram_messages')
    .upsert({
      organization_id: account.organization_id,
      store_id: account.store_id,
      account_id: account.id,
      conversation_id: conversationId,
      message_id: messageId,
      direction: 'inbound',
      from_user_id: senderId,
      message_type: messageType,
      text_body: textBody,
      content,
      media_url: mediaUrl,
      status: 'received',
      timestamp: timestamp.toISOString(),
    }, {
      onConflict: 'account_id,message_id',
      ignoreDuplicates: true,
    })

  if (messageError) {
    console.error('Error inserting Instagram message:', messageError)
    return
  }

  // Update account last webhook timestamp
  await supabase
    .from('instagram_accounts')
    .update({ last_webhook_at: new Date().toISOString() })
    .eq('id', account.id)

  // Find or create unified CRM contact and trigger automations
  await processAutomation(supabase, account, senderId, textBody, conversationId, messageType)
}

async function handlePostback(supabase: any, account: any, messaging: WebhookMessaging, timestamp: Date) {
  const senderId = messaging.sender.id
  const messageId = messaging.postback!.mid
  const payload = messaging.postback!.payload
  const title = messaging.postback!.title

  // Find or create conversation
  const { data: conversationId } = await supabase.rpc('upsert_instagram_conversation', {
    p_organization_id: account.organization_id,
    p_store_id: account.store_id,
    p_account_id: account.id,
    p_participant_id: senderId,
  })

  // Insert as message
  await supabase
    .from('instagram_messages')
    .upsert({
      organization_id: account.organization_id,
      store_id: account.store_id,
      account_id: account.id,
      conversation_id: conversationId,
      message_id: messageId,
      direction: 'inbound',
      from_user_id: senderId,
      message_type: 'postback',
      text_body: title,
      content: { payload, title },
      status: 'received',
      timestamp: timestamp.toISOString(),
    }, {
      onConflict: 'account_id,message_id',
      ignoreDuplicates: true,
    })

  // Trigger automation
  await processAutomation(supabase, account, senderId, title, conversationId, 'postback')
}

async function handleReaction(supabase: any, account: any, messaging: WebhookMessaging) {
  const { mid, action, reaction, emoji } = messaging.reaction!

  if (action === 'react') {
    // Find the message and add reaction
    await supabase
      .from('instagram_messages')
      .update({
        content: supabase.sql`jsonb_set(COALESCE(content, '{}'), '{reaction}', ${JSON.stringify({ emoji: emoji || reaction, from: messaging.sender.id })}::jsonb)`,
      })
      .eq('message_id', mid)
  } else {
    // Remove reaction
    await supabase
      .from('instagram_messages')
      .update({
        content: supabase.sql`content - 'reaction'`,
      })
      .eq('message_id', mid)
  }
}

async function handleReadReceipt(supabase: any, account: any, messaging: WebhookMessaging) {
  const { watermark } = messaging.read!

  // Mark all messages before watermark as read
  await supabase
    .from('instagram_messages')
    .update({ status: 'read', read_at: new Date().toISOString() })
    .eq('account_id', account.id)
    .eq('direction', 'outbound')
    .lte('timestamp', new Date(watermark).toISOString())
    .in('status', ['sent', 'delivered'])
}

async function processAutomation(
  supabase: any,
  account: any,
  senderId: string,
  messageText: string,
  conversationId: string,
  messageType: string
) {
  try {
    // Find or create unified CRM contact
    let crmContactId: string | null = null

    // Check if Instagram contact has linked CRM contact
    const { data: igContact } = await supabase
      .from('instagram_contacts')
      .select('crm_contact_id, username, name')
      .eq('organization_id', account.organization_id)
      .eq('instagram_user_id', senderId)
      .single()

    if (igContact?.crm_contact_id) {
      crmContactId = igContact.crm_contact_id
    } else {
      // Create CRM contact
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: account.organization_id,
          first_name: igContact?.name || igContact?.username || 'Instagram User',
          source: 'instagram',
          tags: ['instagram'],
          custom_fields: {
            instagram_user_id: senderId,
            instagram_username: igContact?.username,
          },
        })
        .select()
        .single()

      if (!contactError && newContact) {
        crmContactId = newContact.id

        // Link Instagram contact to CRM contact
        await supabase
          .from('instagram_contacts')
          .update({ crm_contact_id: crmContactId })
          .eq('organization_id', account.organization_id)
          .eq('instagram_user_id', senderId)

        // Link conversation to CRM contact
        await supabase
          .from('instagram_conversations')
          .update({ unified_contact_id: crmContactId })
          .eq('id', conversationId)
      }
    }

    // Trigger automation rules
    // Import RuleEngine dynamically to avoid circular dependencies
    const { RuleEngine } = await import('@/lib/services/automation/rule-engine')

    await RuleEngine.processCreationRules(
      account.organization_id,
      'instagram',
      'message_received',
      {
        contact_id: crmContactId || undefined,
        contact_name: igContact?.name || igContact?.username,
        message_text: messageText,
        message_type: messageType,
        source_id: `instagram_${conversationId}`,
        conversation_id: conversationId,
        instagram_user_id: senderId,
      }
    )
  } catch (error) {
    console.error('Error processing Instagram automation:', error)
    // Don't throw - automation failures shouldn't fail message processing
  }
}
