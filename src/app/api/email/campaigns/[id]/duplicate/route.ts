import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { data: original, error: fetchErr } = await supabaseAdmin
      .from('email_campaigns')
      .select('*')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .single();

    if (fetchErr || !original) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    const { data: clone, error: insertErr } = await supabaseAdmin
      .from('email_campaigns')
      .insert({
        organization_id: organizationId,
        store_id: original.store_id,
        name: `Cópia de ${original.name}`,
        subject: original.subject,
        template_id: original.template_id,
        from_email: original.from_email,
        sender_name: original.sender_name,
        reply_to: original.reply_to,
        segment_id: original.segment_id,
        status: 'draft',
        ab_test_enabled: original.ab_test_enabled,
        ab_test_percent: original.ab_test_percent,
        ab_variant_b: original.ab_variant_b,
        ab_winner_metric: original.ab_winner_metric,
        ab_duration_hours: original.ab_duration_hours,
        smart_sending_enabled: original.smart_sending_enabled,
        smart_sending_hours: original.smart_sending_hours,
        skip_unengaged: original.skip_unengaged,
        skip_unengaged_days: original.skip_unengaged_days,
        send_time_optimization: original.send_time_optimization,
      })
      .select()
      .single();

    if (insertErr || !clone) {
      return NextResponse.json({ error: insertErr?.message || 'Failed to duplicate' }, { status: 500 });
    }

    return NextResponse.json({ campaign: clone }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
