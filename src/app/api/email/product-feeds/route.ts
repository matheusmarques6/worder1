import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const { user } = auth

    const { data, error } = await supabaseAdmin
      .from('product_feeds')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data || [])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()
    const { user } = auth
    const body = await request.json()

    const { data, error } = await supabaseAdmin.from('product_feeds').insert({
      organization_id: user.organization_id,
      name: body.name,
      feed_type: body.feed_type || 'bestsellers',
      time_period: body.time_period || '30d',
      filters: body.filters || [],
      max_products: body.max_products || 4,
      layout: body.layout || '2x2',
      show_price: body.show_price ?? true,
      show_compare_price: body.show_compare_price ?? true,
      show_button: body.show_button ?? true,
      button_text: body.button_text || 'Comprar',
    }).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
