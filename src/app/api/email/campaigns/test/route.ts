import { NextRequest, NextResponse } from 'next/server'
import { getAuthClient } from '@/lib/api-utils'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { sendEmail } from '@/lib/email/resend'
import { renderMergeTags } from '@/lib/email/render'
import { mergeTags } from '@/lib/email/merge-tags'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const auth = await getAuthClient()
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { campaignId, testEmail } = await req.json()
    if (!testEmail) return NextResponse.json({ error: 'testEmail required' }, { status: 400 })

    // Get campaign + template
    const { data: campaign } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .eq('organization_id', auth.user.organization_id)
      .single()

    if (!campaign || !campaign.email_templates) {
      return NextResponse.json({ error: 'Campaign or template not found' }, { status: 404 })
    }

    // Use sample data for merge tags
    const sampleData: Record<string, string> = {}
    for (const [key, tag] of Object.entries(mergeTags)) {
      sampleData[key] = tag.sample
    }

    const html = renderMergeTags(campaign.email_templates.html || '', sampleData)

    const result = await sendEmail({
      to: testEmail,
      from: campaign.sender_email || 'noreply@worder.com.br',
      senderName: campaign.sender_name || 'Worder (Teste)',
      subject: `[TESTE] ${campaign.subject || 'Sem assunto'}`,
      html,
    })

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Email de teste enviado!' })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
