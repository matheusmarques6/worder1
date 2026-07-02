import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient, authError } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const storeId = searchParams.get('store_id')
    const subscribedOnly = searchParams.get('subscribed_only') === 'true'

    // ✅ SEMPRE derivar org da sessão — nunca confiar no query param
    const auth = await getAuthClient()
    if (!auth) return authError()
    const organizationId = auth.user.organization_id

    // Se o cliente passar um organization_id diferente do da sessão, rejeitar
    const requestedOrg = searchParams.get('organization_id')
    if (requestedOrg && requestedOrg !== organizationId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    let q: any = supabaseAdmin
      .from('contacts')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', organizationId)

    if (storeId) q = q.eq('store_id', storeId)
    if (subscribedOnly) {
      q = q.eq('is_subscribed_email', true).not('email', 'is', null)
    }

    const { count, error } = await q
    if (error) throw error

    return NextResponse.json({ count: count ?? 0 })
  } catch (err: any) {
    console.error('[contacts/count]', err)
    return NextResponse.json({ error: err?.message || 'error' }, { status: 500 })
  }
}
