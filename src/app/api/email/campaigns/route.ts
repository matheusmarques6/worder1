// =============================================
// WORDER: Email Campaigns API
// /src/app/api/email/campaigns/route.ts
//
// GET: list campaigns with stats, POST: create.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');

    let query = supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(id, name)')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('[EmailCampaigns] Error fetching campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    // Fetch stats for each campaign
    const campaignsWithStats = await Promise.all(
      (campaigns || []).map(async (campaign) => {
        try {
          const { data: sends } = await supabaseAdmin
            .from('email_sends')
            .select('status, opened_at, clicked_at')
            .eq('campaign_id', campaign.id);

          const total = sends?.length || 0;
          const delivered = sends?.filter((s) => s.status === 'delivered').length || 0;
          const opened = sends?.filter((s) => s.opened_at).length || 0;
          const clicked = sends?.filter((s) => s.clicked_at).length || 0;
          const bounced = sends?.filter((s) => s.status === 'bounced').length || 0;

          return {
            ...campaign,
            stats: {
              total,
              delivered,
              opened,
              clicked,
              bounced,
              open_rate: total > 0 ? ((opened / total) * 100).toFixed(1) : '0.0',
              click_rate: total > 0 ? ((clicked / total) * 100).toFixed(1) : '0.0',
            },
          };
        } catch {
          return { ...campaign, stats: null };
        }
      })
    );

    return NextResponse.json({ campaigns: campaignsWithStats });
  } catch (error) {
    console.error('[EmailCampaigns] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const body = await request.json();

    const {
      name,
      subject,
      template_id,
      from_email,
      sender_name,
      reply_to,
      segment_id,
      store_id,
    } = body;

    if (!name || !subject || !template_id || !from_email) {
      return NextResponse.json(
        { error: 'name, subject, template_id, and from_email are required' },
        { status: 400 }
      );
    }

    const { data: campaign, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert({
        organization_id: user.organization_id,
        name,
        subject,
        template_id,
        from_email,
        sender_name: sender_name || null,
        reply_to: reply_to || null,
        segment_id: segment_id || null,
        store_id: store_id || null,
        status: 'draft',
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error('[EmailCampaigns] Error creating campaign:', error);
      return NextResponse.json({ error: 'Failed to create campaign' }, { status: 500 });
    }

    return NextResponse.json({ campaign }, { status: 201 });
  } catch (error) {
    console.error('[EmailCampaigns] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
