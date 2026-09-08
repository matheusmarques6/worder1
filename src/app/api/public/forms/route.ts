import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sanitizeDomain } from '@/lib/forms/submit-utils'

export const dynamic = 'force-dynamic'

// Public endpoint: list published forms/popups for a store domain
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const domain = searchParams.get('domain')
    const status = searchParams.get('status') || 'published'
    const type = searchParams.get('type')

    // Sanitize before it ever touches a PostgREST filter: the previous
    // .or(`shop_domain.eq.${domain},...`) let a crafted domain like
    // "x,id.not.is.null" inject extra filter clauses and enumerate every
    // org's published forms. Only [a-z0-9.-] survives.
    const cleanDomain = sanitizeDomain(domain)
    if (!cleanDomain) {
      return NextResponse.json({ forms: [] })
    }

    // Find store by domain: exact, alias-aware match on shop_domain,
    // primary_domain (the public storefront host) or any alias; "www."
    // is stripped by the resolver. The old suffix fallback
    // (ilike '%domain') let a lookalike host ("groot.com") be served
    // another store's popups ("drgroot.com").
    const { resolveStoreByDomain } = await import('@/lib/shopify/resolve-store-by-domain')
    const store = await resolveStoreByDomain<{ id: string; organization_id: string }>(
      supabaseAdmin,
      cleanDomain,
      { select: 'id, organization_id', activeOnly: true }
    )

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
