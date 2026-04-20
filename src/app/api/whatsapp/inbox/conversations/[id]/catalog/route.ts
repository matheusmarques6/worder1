// =============================================
// API: Send Product Catalog in Chat
// POST /api/whatsapp/inbox/conversations/[id]/catalog
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { WhatsAppCloudAPI } from '@/lib/whatsapp/cloud-api'

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
    const { productIds, headerText, bodyText, catalogId } = body

    if (!productIds || !Array.isArray(productIds) || productIds.length === 0) {
      return NextResponse.json({ error: 'productIds array required' }, { status: 400 })
    }

    // Get conversation + instance
    const { data: conv } = await supabaseAdmin
      .from('whatsapp_conversations')
      .select('instance_id, contact_phone')
      .eq('id', params.id)
      .eq('organization_id', organizationId)
      .single()

    if (!conv || !conv.instance_id) {
      return NextResponse.json({ error: 'Conversation or instance not found' }, { status: 404 })
    }

    const { data: instance } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('phone_number_id, access_token, metadata')
      .eq('id', conv.instance_id)
      .single()

    if (!instance) {
      return NextResponse.json({ error: 'Instance not found' }, { status: 404 })
    }

    // Use catalog_id from request, or from instance metadata
    const finalCatalogId = catalogId || (instance.metadata as any)?.catalog_id

    if (!finalCatalogId) {
      return NextResponse.json({
        error: 'catalog_id not configured. Set it in instance metadata or pass in request.',
      }, { status: 400 })
    }

    // Send via Meta API directly (interactive product_list)
    const response = await fetch(
      `https://graph.facebook.com/v21.0/${instance.phone_number_id}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${instance.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: conv.contact_phone.replace(/\D/g, ''),
          type: 'interactive',
          interactive: {
            type: 'product_list',
            header: { type: 'text', text: (headerText || 'Produtos').substring(0, 60) },
            body: { text: (bodyText || 'Confira nossos produtos').substring(0, 1024) },
            action: {
              catalog_id: finalCatalogId,
              sections: [
                {
                  title: 'Destaques',
                  product_items: productIds.slice(0, 30).map((id: string) => ({
                    product_retailer_id: id,
                  })),
                },
              ],
            },
          },
        }),
      }
    )

    const result = await response.json()

    if (!response.ok) {
      return NextResponse.json(
        { error: result?.error?.message || 'Failed to send catalog', details: result },
        { status: 500 }
      )
    }

    // Save message record
    const wamid = result.messages?.[0]?.id
    await supabaseAdmin.from('whatsapp_messages').insert({
      organization_id: organizationId,
      conversation_id: params.id,
      wamid,
      direction: 'outbound',
      message_type: 'interactive',
      content: `Catalogo enviado: ${productIds.length} produtos`,
      interactive_data: { type: 'product_list', catalog_id: finalCatalogId, product_ids: productIds },
      sender_type: 'system',
      status: 'sent',
      is_from_me: true,
    })

    return NextResponse.json({ data: { wamid, productCount: productIds.length } })
  } catch (error: unknown) {
    const err = error as Error
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
