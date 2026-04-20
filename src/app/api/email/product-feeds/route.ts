import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const { data, error } = await supabaseAdmin
      .from('product_feeds')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[ProductFeeds] GET error:', error.message)
      // Table may not exist yet
      return NextResponse.json([])
    }
    return NextResponse.json(data || [])
  } catch (error: any) {
    console.error('[ProductFeeds] GET exception:', error)
    return NextResponse.json([])
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return authError()

    const body = await request.json()

    if (!body.name) {
      return NextResponse.json({ error: 'Nome é obrigatório' }, { status: 400 })
    }

    // Only insert columns that exist in the table
    const insertData: Record<string, any> = {
      organization_id: auth.user.organization_id,
      name: body.name,
      feed_type: body.feed_type || 'bestsellers',
    }

    // Optional fields - only add if provided
    if (body.fallback_type) insertData.fallback_type = body.fallback_type
    if (body.time_period) insertData.time_period = body.time_period
    if (body.filters && Array.isArray(body.filters)) insertData.filters = body.filters
    if (body.max_products) insertData.max_products = body.max_products
    if (body.columns) insertData.columns = body.columns

    console.log('[ProductFeeds] Creating:', insertData)

    const { data, error } = await supabaseAdmin
      .from('product_feeds')
      .insert(insertData)
      .select()
      .single()

    if (error) {
      console.error('[ProductFeeds] POST error:', error.message)

      // If column error, retry with minimal fields
      if (error.message?.includes('column') || error.code === '42703') {
        const minimalData = {
          organization_id: auth.user.organization_id,
          name: body.name,
          feed_type: body.feed_type || 'bestsellers',
        }
        const { data: d2, error: e2 } = await supabaseAdmin
          .from('product_feeds').insert(minimalData).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 })
        return NextResponse.json(d2, { status: 201 })
      }

      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data, { status: 201 })
  } catch (error: any) {
    console.error('[ProductFeeds] POST exception:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
