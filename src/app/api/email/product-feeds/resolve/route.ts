import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { resolveProductFeed } from '@/lib/email/product-feeds'

// Thin HTTP wrapper around resolveProductFeed(). The email render pipeline
// now calls the library function directly (no HTTP round-trip); this route
// stays for any external/authenticated callers and the editor preview.
export async function POST(request: NextRequest) {
  try {
    const isInternal = request.headers.get('X-Internal') === 'true'
    const body = await request.json()

    let orgId: string | null = null
    if (isInternal) {
      orgId = body.organization_id || null
    } else {
      const auth = await getAuthClient()
      if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      orgId = auth.user.organization_id
    }
    if (!orgId) return NextResponse.json({ products: [] })

    const products = await resolveProductFeed({
      orgId,
      feedId: body.feed_id,
      feedType: body.feed_type,
      contactId: body.contact_id,
      maxProducts: body.max_products ?? 4,
      eventData: body.event_data,
    })

    return NextResponse.json({ products })
  } catch (error: any) {
    return NextResponse.json({ products: [], error: error.message }, { status: 200 })
  }
}
