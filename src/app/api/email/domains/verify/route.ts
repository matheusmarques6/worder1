import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { verifyDomain, getDomain } from '@/lib/email/resend'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domainId } = await req.json()
    if (!domainId) return NextResponse.json({ error: 'domainId required' }, { status: 400 })

    // Get domain record
    const { data: domainRecord } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', domainId)
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (!domainRecord) return NextResponse.json({ error: 'Domain not found' }, { status: 404 })

    // Verify in Resend
    const verifyResult = await verifyDomain(domainRecord.resend_domain_id)

    // Get updated status
    const statusResult = await getDomain(domainRecord.resend_domain_id)
    const newStatus = statusResult.domain?.status === 'verified' ? 'verified' : 'pending'

    // Update in DB
    await supabaseAdmin
      .from('email_domains')
      .update({
        status: newStatus,
        verified_at: newStatus === 'verified' ? new Date().toISOString() : null,
      })
      .eq('id', domainId)

    return NextResponse.json({
      success: true,
      status: newStatus,
      domain: statusResult.domain,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
