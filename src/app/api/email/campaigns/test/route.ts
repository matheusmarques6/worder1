// =============================================
// WORDER: Test Campaign Email API
// /src/app/api/email/campaigns/test/route.ts
//
// POST: send 1 test email with sample merge data.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email/resend';
import { prepareEmailHtml, renderMergeTags } from '@/lib/email/render';
import { getSampleMergeData } from '@/lib/email/merge-tags';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    const { campaign_id, to_email } = body;

    if (!campaign_id) {
      return NextResponse.json({ error: 'campaign_id is required' }, { status: 400 });
    }

    const testEmail = to_email || user.email;

    // Get campaign with template
    const { data: campaign, error: campaignError } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaign_id)
      .eq('organization_id', user.organization_id)
      .single();

    if (campaignError || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const template = campaign.email_templates;
    if (!template) {
      return NextResponse.json({ error: 'Campaign template not found' }, { status: 404 });
    }

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
    const sampleData = getSampleMergeData();

    // Use a fake emailSendId for test emails
    const testSendId = 'test-' + Date.now();

    // Blocos dinâmicos de produto com a loja DA CAMPANHA — o teste tem de
    // mostrar os produtos e links que o cliente vai receber. Sem isto o
    // e-mail de teste saía com os comentários <!-- WORDER_*_BLOCK --> crus.
    let htmlSource: string = template.html;
    try {
      const { resolveProductBlocks, resolveCartBlocks } = await import('@/lib/email/render');
      htmlSource = await resolveProductBlocks(htmlSource, user.organization_id, undefined, undefined, campaign.store_id || null);
      htmlSource = await resolveCartBlocks(htmlSource, user.organization_id, undefined, undefined, null, undefined, campaign.store_id || null);
    } catch (e: any) {
      console.warn('[TestCampaign] dynamic block resolve failed:', e?.message);
    }

    // UTM + identificação como no envio real (configuração da loja da campanha).
    let linkParams: any = null;
    try {
      const { getUtmSettings } = await import('@/lib/tracking/utm-settings');
      const { makeLinkParamsResolver, normalizeMessageUtmConfig } = await import('@/lib/tracking/link-params');
      const { settings } = await getUtmSettings(user.organization_id, campaign.store_id || null);
      const campaignUtm = normalizeMessageUtmConfig((campaign as any).settings?.utm);
      linkParams = makeLinkParamsResolver(settings, {
        channel: 'email',
        messageType: 'campaign',
        campaignName: campaign.name || '',
        campaignId: campaign.id,
        emailSubject: renderMergeTags(campaign.subject || '', sampleData, { escape: false }),
        sendId: testSendId,
        storeName: sampleData.store_name,
        storeDomain: sampleData.store_url,
        extra: sampleData,
      }, { utmOverrides: campaignUtm?.overrides || null, utmDisabled: campaignUtm?.disabled === true });
    } catch { /* teste segue sem UTM no href */ }

    const finalHtml = prepareEmailHtml({
      html: htmlSource,
      mergeData: sampleData,
      emailSendId: testSendId,
      baseUrl,
      linkParams,
    });

    // escape:false — subject is text/plain (no &amp; in the inbox).
    const finalSubject = `[TESTE] ${renderMergeTags(campaign.subject, sampleData, { escape: false })}`;

    await sendEmail({
      to: testEmail,
      from: campaign.from_email,
      senderName: campaign.sender_name,
      subject: finalSubject,
      html: finalHtml,
      replyTo: campaign.reply_to,
    });

    return NextResponse.json({
      success: true,
      message: `E-mail de teste enviado para ${testEmail}`,
    });
  } catch (error: any) {
    console.error('[TestCampaign] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
