import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Metric definitions — grouped by integration/source
const SHOPIFY_METRICS = [
  // Ecommerce funnel
  { key: 'viewed_product', label: 'Produto visualizado', icon: 'Eye' },
  { key: 'viewed_collection', label: 'Coleção visualizada', icon: 'LayoutGrid' },
  { key: 'submitted_search', label: 'Busca realizada', icon: 'Search' },
  { key: 'added_to_cart', label: 'Adicionado ao carrinho', icon: 'ShoppingCart' },
  { key: 'removed_from_cart', label: 'Removido do carrinho', icon: 'MinusCircle' },
  { key: 'cart_viewed', label: 'Carrinho visualizado', icon: 'ShoppingBag' },
  // Checkout funnel
  { key: 'checkout_started', label: 'Checkout iniciado', icon: 'CreditCard' },
  { key: 'checkout_contact_submitted', label: 'Contato do checkout enviado', icon: 'User' },
  { key: 'payment_submitted', label: 'Pagamento enviado', icon: 'Wallet' },
  { key: 'checkout_completed', label: 'Checkout concluído', icon: 'CheckCircle' },
  { key: 'checkout_abandoned', label: 'Checkout abandonado', icon: 'AlertTriangle' },
  // Orders
  { key: 'placed_order', label: 'Pedido realizado', icon: 'Package' },
  { key: 'ordered_product', label: 'Produto pedido', icon: 'Box' },
  { key: 'fulfilled_order', label: 'Pedido enviado', icon: 'Truck' },
  { key: 'shipment_confirmed', label: 'Envio confirmado', icon: 'PackageCheck' },
  { key: 'shipment_delivered', label: 'Envio entregue', icon: 'PackageOpen' },
  { key: 'cancelled_order', label: 'Pedido cancelado', icon: 'XCircle' },
  { key: 'refunded_order', label: 'Pedido reembolsado', icon: 'RotateCcw' },
  // On-site behavior
  { key: 'active_on_site', label: 'Ativo no site', icon: 'Activity' },
  { key: 'page_viewed', label: 'Página visualizada', icon: 'FileText' },
]

const WORDER_METRICS = [
  // Email
  { key: 'email_received', label: 'E-mail recebido', icon: 'Mail' },
  { key: 'email_opened', label: 'E-mail aberto', icon: 'MailOpen' },
  { key: 'email_clicked', label: 'E-mail clicado', icon: 'MousePointerClick' },
  { key: 'email_bounced', label: 'E-mail retornado', icon: 'MailX' },
  { key: 'email_unsubscribed', label: 'Descadastrado', icon: 'UserMinus' },
  { key: 'email_conversion', label: 'Conversão de e-mail', icon: 'Target' },
  // WhatsApp
  { key: 'whatsapp_message_received', label: 'WhatsApp recebido', icon: 'MessageCircle' },
  { key: 'whatsapp_first_message', label: 'Primeira mensagem WhatsApp', icon: 'MessageSquarePlus' },
  { key: 'whatsapp_keyword', label: 'Palavra-chave WhatsApp', icon: 'Hash' },
  { key: 'ctwa_ad', label: 'Anúncio Click-to-WhatsApp', icon: 'MousePointer' },
  { key: 'back_in_stock', label: 'Alerta de volta ao estoque', icon: 'Bell' },
  // Forms / Profile
  { key: 'form_submitted', label: 'Formulário enviado', icon: 'ClipboardCheck' },
  { key: 'profile_created', label: 'Perfil criado', icon: 'UserPlus' },
  { key: 'profile_updated', label: 'Perfil atualizado', icon: 'UserCog' },
  { key: 'subscribed_email', label: 'Inscrito no e-mail', icon: 'AtSign' },
  { key: 'subscribed_sms', label: 'Inscrito no SMS', icon: 'Smartphone' },
  // Lifecycle
  { key: 'rfm_segment_change', label: 'Mudança de segmento RFM', icon: 'BarChart3' },
]

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const orgId = auth.user.organization_id
    const { searchParams } = request.nextUrl
    const integration = searchParams.get('integration') || 'all'
    const days = parseInt(searchParams.get('days') || '30')
    const storeId = searchParams.get('storeId')

    const since = new Date()
    since.setDate(since.getDate() - days)

    // Try RPC first, fallback to direct query
    const countMap: Record<string, number> = {}

    // If storeId provided, skip RPC (it filters by org, not store) and go direct
    if (!storeId) {
      const { data: counts, error: rpcError } = await supabaseAdmin
        .rpc('count_events_by_type', {
          p_org_id: orgId,
          p_since: since.toISOString(),
        })

      if (!rpcError && counts) {
        for (const row of counts as any[]) {
          countMap[row.event_type] = Number(row.cnt) || 0
        }
      }
    }

    if (Object.keys(countMap).length === 0) {
      console.warn('[Metrics] Using fallback query')
      try {
        // Get counts per event_type by fetching just the event_type column
        // Use a large limit to avoid the 1000-row default
        let evQuery = supabaseAdmin
          .from('contact_events')
          .select('event_type')
          .gte('occurred_at', since.toISOString())
          .limit(50000)

        if (storeId) {
          evQuery = evQuery.eq('store_id', storeId)
        } else {
          evQuery = evQuery.eq('organization_id', orgId)
        }

        const { data: rawEvents } = await evQuery

        if (rawEvents) {
          for (const row of rawEvents) {
            countMap[row.event_type] = (countMap[row.event_type] || 0) + 1
          }
        }
      } catch (fallbackErr: any) {
        console.error('[Metrics] Fallback query also failed:', fallbackErr?.message)
      }
    }

    let metrics = []
    if (integration === 'all' || integration === 'shopify') {
      metrics.push(...SHOPIFY_METRICS.map(m => ({ ...m, count: countMap[m.key] || 0, integration: 'shopify' })))
    }
    if (integration === 'all' || integration === 'worder') {
      metrics.push(...WORDER_METRICS.map(m => ({ ...m, count: countMap[m.key] || 0, integration: 'worder' })))
    }

    return NextResponse.json({ metrics, days })
  } catch (error: any) {
    console.error('[Metrics]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
