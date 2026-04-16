import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { getAuthClient } from '@/lib/api-utils'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    let organizationId = searchParams.get('organization_id')
    const storeId = searchParams.get('store_id')
    const subscribedOnly = searchParams.get('subscribed_only') === 'true'

    if (!organizationId) {
      const auth = await getAuthClient()
      if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      organizationId = auth.user.organization_id
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
