import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { campaignId, testEmail } = await request.json();
    if (!campaignId || !testEmail) {
      return NextResponse.json({ error: 'campaignId and testEmail required' }, { status: 400 });
    }

    const { data: campaign } = await supabase
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('organization_id', orgId)
      .single();

    if (!campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: org } = await supabase
      .from('organizations')
      .select('id, name')
      .eq('id', orgId)
      .single();

    const { sendCampaignEmail } = await import('@/lib/email/send-campaign-email');

    const testContact = {
      id: 'test-' + Date.now(),
      email: testEmail,
      first_name: 'Teste',
      last_name: 'Email',
      name: 'Teste Email',
    };

    const result = await sendCampaignEmail({
      supabaseAdmin: supabase,
      contact: testContact,
      template: {
        html: campaign.html_content || '<p>Olá {{first_name}}, este é um email de teste.</p>',
        subject: `[TESTE] ${campaign.subject || 'Sem assunto'}`,
      },
      org: { id: orgId, name: org?.name },
      campaign: {
        id: campaignId,
        sender_name: campaign.from_name || org?.name,
        sender_email: campaign.from_email,
      },
    });

    if (result.success) {
      return NextResponse.json({ success: true, message: `Email de teste enviado para ${testEmail}` });
    } else {
      return NextResponse.json({ error: result.error || 'Send failed' }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
