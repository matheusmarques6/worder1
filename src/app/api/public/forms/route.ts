import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// Public endpoint: list published forms/popups for a store domain
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const domain = searchParams.get('domain')
    const status = searchParams.get('status') || 'published'
    const type = searchParams.get('type')

    if (!domain) {
      return NextResponse.json({ forms: [] })
    }

    // Find store by domain
    const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/$/, '')
    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('id, organization_id')
      .or(`shop_domain.eq.${cleanDomain},shop_domain.ilike.%${cleanDomain}%`)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!store) {
      return NextResponse.json({ forms: [] })
    }

    // Get published forms for this org
    let query = supabaseAdmin
      .from('crm_forms')
      .select('id, name, form_type, status, store_id')
      .eq('organization_id', store.organization_id)
      .eq('status', status)

    if (type) {
      query = query.eq('form_type', type)
    }

    // If form has store_id, only show on matching store; forms without store_id show on all stores
    const { data: allForms } = await query
    const forms = (allForms || []).filter(f => !f.store_id || f.store_id === store.id)

    const headers = new Headers()
    headers.set('Access-Control-Allow-Origin', '*')
    headers.set('Cache-Control', 'public, max-age=60')

    return NextResponse.json({ forms: forms || [] }, { headers })
  } catch {
    return NextResponse.json({ forms: [] })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
