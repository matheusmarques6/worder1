// =============================================
// API: Send Payment Link in Chat
// POST /api/whatsapp/inbox/conversations/[id]/payment-link
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendMessage } from '@/lib/services/whatsapp/message-service'

export const dynamic = 'force-dynamic'

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const organizationId = searchParams.get('organizationId')

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId required' }, { status: 400 })
    }

    const body = await request.json()
    const { amount, currency = 'BRL', description, paymentUrl } = body

    if (!amount || amount <= 0) {
      return NextResponse.json({ error: 'Valid amount required' }, { status: 400 })
    }

    // Get conversation
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('id, instance_id, contact_phone, contact_id')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (!conv || !conv.instance_id) {
      return NextResponse.json({ error: 'Conversation or instance not found' }, { status: 404 })
    }

    // Create payment link record
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const url = paymentUrl || `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.example.com'}/pay/${params.id}/${Date.now()}`

    const { data: link, error } = await supabaseAdmin
      .from('whatsapp_payment_links')
      .insert({
        organization_id: organizationId,
        conversation_id: params.id,
        contact_id: conv.contact_id,
        amount,
        currency,
        description,
        payment_url: url,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Build message text
    const formatted = new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount)
    const messageText = [
      `💳 Link de pagamento`,
      description ? `*${description}*` : null,
      `Valor: ${formatted}`,
      ``,
      `Pague aqui: ${url}`,
      ``,
      `Link valido por 7 dias.`,
    ].filter(Boolean).join('\n')

    // Send via WhatsApp
    const result = await sendMessage({
      conversationId: params.id,
      organizationId,
      instanceId: conv.instance_id,
      to: conv.contact_phone,
      messageType: 'text',
      content: messageText,
      senderType: 'system',
      senderName: 'Pagamento',
    })

    return NextResponse.json({ data: { link, message: result.data } })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
