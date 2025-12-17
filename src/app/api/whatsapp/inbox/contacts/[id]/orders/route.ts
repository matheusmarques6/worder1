import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/whatsapp/inbox/contacts/[id]/orders
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params

    // Busca contato com shopify_customer_id
    const { data: contact, error: contactError } = await supabase
      .from('whatsapp_contacts')
      .select('shopify_customer_id, organization_id, phone_number, email')
      .eq('id', id)
      .single()

    if (contactError || !contact) {
      return NextResponse.json({ error: 'Contact not found' }, { status: 404 })
    }

    // Se não tem customer_id, tenta buscar por telefone/email nos pedidos
    let orders = []
    let cart = null

    // Busca pedidos da tabela local
    const { data: localOrders } = await supabase
      .from('shopify_orders')
      .select('*')
      .eq('organization_id', contact.organization_id)
      .or(`customer_phone.eq.${contact.phone_number},customer_email.eq.${contact.email}`)
      .order('created_at', { ascending: false })
      .limit(10)

    orders = localOrders || []

    // Busca carrinho abandonado
    const { data: abandonedCart } = await supabase
      .from('shopify_abandoned_checkouts')
      .select('*')
      .eq('organization_id', contact.organization_id)
      .or(`customer_phone.eq.${contact.phone_number},customer_email.eq.${contact.email}`)
      .eq('recovered', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()

    if (abandonedCart) {
      cart = abandonedCart
    }

    // Calcula resumo
    const summary = {
      totalOrders: orders.length,
      totalSpent: orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0),
      averageOrderValue: orders.length > 0 
        ? orders.reduce((sum: number, o: any) => sum + (parseFloat(o.total_price) || 0), 0) / orders.length 
        : 0,
      lastOrderDate: orders[0]?.created_at || null
    }

    return NextResponse.json({
      orders,
      cart,
      summary
    })

  } catch (error) {
    console.error('Error fetching orders:', error)
    return NextResponse.json({ error: 'Failed to fetch orders' }, { status: 500 })
  }
}
