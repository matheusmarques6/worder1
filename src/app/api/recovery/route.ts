import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const type = req.nextUrl.searchParams.get('type') || 'cart'
    const orgId = auth.user.organization_id

    // Try to fetch recovery items
    let items: any[] = []
    try {
      const { data } = await supabaseAdmin
        .from('recovery_items')
        .select('*')
        .eq('organization_id', orgId)
        .eq('type', type)
        .order('created_at', { ascending: false })
        .limit(50)
      items = data || []
    } catch {
      // Table may not exist yet
    }

    // Calculate stats
    let stats = { pending: 0, recovered_month: 0, recovery_rate: 0, revenue_recovered: 0 }
    try {
      const now = new Date()
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const { count: pendingCount } = await supabaseAdmin
        .from('recovery_items')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'pending')

      const { count: recoveredCount } = await supabaseAdmin
        .from('recovery_items')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('status', 'recovered')
        .gte('updated_at', monthStart)

      const { count: totalCount } = await supabaseAdmin
        .from('recovery_items')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', orgId)

      const { data: revenueData } = await supabaseAdmin
        .from('recovery_items')
        .select('amount')
        .eq('organization_id', orgId)
        .eq('status', 'recovered')

      const totalRevenue = revenueData?.reduce((sum, r) => sum + (r.amount || 0), 0) || 0

      stats = {
        pending: pendingCount || 0,
        recovered_month: recoveredCount || 0,
        recovery_rate: totalCount && totalCount > 0 ? ((recoveredCount || 0) / totalCount) * 100 : 0,
        revenue_recovered: totalRevenue,
      }
    } catch {
      // Stats calculation failed, use defaults
    }

    return NextResponse.json({ success: true, items, stats })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
