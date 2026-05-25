import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { data: campaign, error } = await supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(*)')
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .single();

    if (error || !campaign) {
      return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
    }

    // Fetch send stats
    const { count: totalSends } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId);

    const { count: opened } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('opened_at', 'is', null);

    const { count: clicked } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .not('clicked_at', 'is', null);

    const { count: bounced } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'bounced');

    const { count: unsubscribed } = await supabaseAdmin
      .from('email_sends')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'unsubscribed');

    const total = totalSends || campaign.total_sent || 0;
    return NextResponse.json({
      campaign: {
        ...campaign,
        stats: {
          total,
          opened: opened || 0,
          clicked: clicked || 0,
          bounced: bounced || 0,
          unsubscribed: unsubscribed || 0,
          open_rate: total > 0 ? ((opened || 0) / total * 100).toFixed(1) : '0.0',
          click_rate: total > 0 ? ((clicked || 0) / total * 100).toFixed(1) : '0.0',
          bounce_rate: total > 0 ? ((bounced || 0) / total * 100).toFixed(1) : '0.0',
          unsubscribe_rate: total > 0 ? ((unsubscribed || 0) / total * 100).toFixed(1) : '0.0',
        },
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    const allowedFields = [
      'name', 'subject', 'template_id', 'from_email', 'sender_name',
      'reply_to', 'segment_id', 'store_id',
      'ab_test_enabled', 'ab_test_percent', 'ab_variant_b',
      'ab_winner_metric', 'ab_duration_hours',
      'smart_sending_enabled', 'smart_sending_hours',
      'skip_unengaged', 'skip_unengaged_days',
      'send_time_optimization',
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }

    // Only allow editing draft or scheduled campaigns
    const { data: campaign, error } = await supabaseAdmin
      .from('email_campaigns')
      .update(updateData)
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'scheduled', 'paused'])
      .select()
      .single();

    if (error || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found or not in editable state (must be draft, scheduled, or paused)' },
        { status: 404 }
      );
    }

    return NextResponse.json({ campaign });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: campaignId } = await params;
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const { error } = await supabaseAdmin
      .from('email_campaigns')
      .delete()
      .eq('id', campaignId)
      .eq('organization_id', organizationId)
      .in('status', ['draft', 'scheduled', 'paused', 'failed']);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
