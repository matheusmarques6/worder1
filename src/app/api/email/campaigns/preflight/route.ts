// =============================================
// WORDER: Pre-flight check endpoint (read-only)
// /src/app/api/email/campaigns/preflight
//
// POST { campaign_id } → returns issues for user to review before sending.
// =============================================

import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient, authError } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { runPreflight } from '@/lib/email/preflight'

export async function POST(req: NextRequest) {
  const auth = await getAuthClient()
  if (!auth) return authError()

  const orgId = auth.user.organization_id
  const { campaign_id } = await req.json()

  if (!campaign_id) {
    return NextResponse.json({ error: 'campaign_id required' }, { status: 400 })
  }

  const { data: campaign } = await supabaseAdmin
    .from('email_campaigns')
    .select('*, email_templates(*)')
    .eq('id', campaign_id)
    .eq('organization_id', orgId)
    .maybeSingle()

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  }

  const template = campaign.email_templates
  // Shared resolver: real `status` column, matches the system domain, and
  // resolves the store/org sender when from_email is blank. The old inline
  // read of `verification_status` always reported domain_not_verified.
  const { resolveSendDomainVerification } = await import('@/lib/email/domain-verification')
  const { fromEmail, domainVerified } = await resolveSendDomainVerification(
    orgId,
    campaign.store_id,
    campaign.from_email
  )

  const issues = runPreflight({
    subject: campaign.subject || template?.subject,
    fromEmail,
    fromName: campaign.from_name,
    html: template?.html_content,
    text: template?.text_content,
    domainVerified,
  })

  return NextResponse.json({
    ok: !issues.some(i => i.severity === 'error'),
    errors: issues.filter(i => i.severity === 'error'),
    warnings: issues.filter(i => i.severity === 'warning'),
  })
}
