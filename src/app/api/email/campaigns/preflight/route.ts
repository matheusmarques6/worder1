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
  const fromEmail = (campaign.from_email || '').trim()
  let domainVerified = true

  if (fromEmail && fromEmail.includes('@')) {
    const domainPart = fromEmail.split('@')[1].toLowerCase()
    const { data: dom } = await supabaseAdmin
      .from('email_domains')
      .select('verification_status')
      .eq('organization_id', orgId)
      .eq('domain', domainPart)
      .maybeSingle()
    if (dom) domainVerified = dom.verification_status === 'verified'
    else domainVerified = false
  }

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
