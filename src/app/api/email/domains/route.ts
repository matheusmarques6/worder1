import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { createDomain, getDomain } from '@/lib/email/resend'
import { supabaseAdmin } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

// GET - List domains for org
export async function GET() {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data: domains } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('organization_id', auth.user.organization_id)
      .order('created_at', { ascending: false })

    return NextResponse.json({ success: true, domains: domains || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST - Add a new domain
export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { domain } = await req.json()
    if (!domain) return NextResponse.json({ error: 'Domain is required' }, { status: 400 })

    // Create domain in Resend
    const result = await createDomain(domain)
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    // Store in database
    const { data, error } = await supabaseAdmin
      .from('email_domains')
      .insert({
        organization_id: auth.user.organization_id,
        domain,
        resend_domain_id: result.domain?.id,
        status: 'pending',
        dns_records: result.domain?.records || [],
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ success: true, domain: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
