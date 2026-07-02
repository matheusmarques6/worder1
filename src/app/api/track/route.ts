import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase-admin'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      event_type,
      organization_id: bodyOrgId,
      // Store identifiers — same resolution contract as /api/track/event
      storeId,
      storeDomain,
      accountId,
      visitor_id,
      session_id,
      url,
      referrer,
      user_agent,
      properties,
    } = body

    if (!event_type) {
      return NextResponse.json({ error: 'Missing eventType' }, { status: 400 })
    }

    const supabase = getSupabaseAdmin()

    // ---- Resolve org via a trusted store key (preferred) ----
    // Never trust a raw body organization_id: resolve the store first
    // (mirrors /api/track/event), and only fall back to the body org
    // after confirming it actually exists.
    let store: { id: string; organization_id: string } | null = null

    if (storeId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('id', storeId)
        .maybeSingle()
      store = data
    }

    if (!store && accountId) {
      const { data } = await supabase
        .from('shopify_stores')
        .select('id, organization_id')
        .eq('organization_id', accountId)
        .limit(1)
        .maybeSingle()
      store = data
    }

    if (!store && storeDomain) {
      const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain')
      store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
        supabase,
        storeDomain,
        { select: 'id, organization_id', activeOnly: false }
      )
    }

    let organizationId: string | null = store?.organization_id || null

    // No reliable store key: validate the body org actually exists before
    // accepting it (prevents writes to arbitrary/foreign org ids).
    if (!organizationId && bodyOrgId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id')
        .eq('id', bodyOrgId)
        .maybeSingle()
      organizationId = org?.id || null
    }

    if (!organizationId) {
      return NextResponse.json({ error: 'Could not resolve organization' }, { status: 400 })
    }

    await supabase.from('tracking_events').insert({
      organization_id: organizationId,
      event_type,
      visitor_id: visitor_id || null,
      session_id: session_id || null,
      url: url || null,
      referrer: referrer || null,
      user_agent: user_agent || null,
      properties: properties || {},
      created_at: new Date().toISOString(),
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
