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
    // Accept both casings — the campaigns page passes `storeId` but
    // other paths in the app use `store_id`. Without this fallback,
    // a multi-store org viewing campaigns of one specific store
    // saw every campaign in the org because the filter was ignored.
    const storeId = searchParams.get('storeId') || searchParams.get('store_id');

    // A loja pedida tem de ser do usuário — um id de outra organização
    // é recusado, não vira filtro.
    if (storeId) {
      const { validateStoreAccess } = await import('@/lib/api-utils');
      const access = await validateStoreAccess(auth.supabase as any, user.organization_id, storeId, user.id);
      if (!access.valid) {
        return NextResponse.json({ error: access.error }, { status: access.status || 403 });
      }
    }

    let query = supabaseAdmin
      .from('email_campaigns')
      .select('*, email_templates(id, name)')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data: campaigns, error } = await query;

    if (error) {
      console.error('[EmailCampaigns] Error fetching campaigns:', error);
      return NextResponse.json({ error: 'Failed to fetch campaigns' }, { status: 500 });
    }

    // total_sent / total_failed come from the campaign row (updated
    // atomically by send-batch via increment_campaign_stats RPC).
    // Opens and clicks come from a single aggregate query instead of
    // N+1 per-campaign queries. We only select the columns we need
    // (campaign_id + opened_at + clicked_at) and use a count-based
    // approach to avoid pulling millions of rows.
    const campaignIds = (campaigns || []).map((c: any) => c.id);
    let engagementMap: Record<string, { opened: number; clicked: number }> = {};

    if (campaignIds.length > 0) {
      try {
        // Opened counts
        const { data: openRows } = await supabaseAdmin
          .from('email_sends')
          .select('campaign_id')
          .in('campaign_id', campaignIds)
          .not('opened_at', 'is', null);

        // Clicked counts
        const { data: clickRows } = await supabaseAdmin
          .from('email_sends')
          .select('campaign_id')
          .in('campaign_id', campaignIds)
          .not('clicked_at', 'is', null);

        for (const r of (openRows || []) as any[]) {
          if (!engagementMap[r.campaign_id]) engagementMap[r.campaign_id] = { opened: 0, clicked: 0 };
          engagementMap[r.campaign_id].opened++;
        }
        for (const r of (clickRows || []) as any[]) {
          if (!engagementMap[r.campaign_id]) engagementMap[r.campaign_id] = { opened: 0, clicked: 0 };
          engagementMap[r.campaign_id].clicked++;
        }
      } catch {
        console.warn('[EmailCampaigns] Engagement query failed');
      }
    }

    const campaignsWithStats = (campaigns || []).map((campaign: any) => {
      const total = campaign.total_sent || 0;
      const bounced = campaign.total_failed || 0;
      const delivered = total - bounced;
      const eng = engagementMap[campaign.id] || { opened: 0, clicked: 0 };
      return {
        ...campaign,
        stats: {
          total,
          delivered,
          opened: eng.opened,
          clicked: eng.clicked,
          bounced,
          open_rate: total > 0 ? ((eng.opened / total) * 100).toFixed(1) : '0.0',
          click_rate: total > 0 ? ((eng.clicked / total) * 100).toFixed(1) : '0.0',
        },
      };
    });

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

    if (!name) {
      return NextResponse.json(
        { error: 'name is required' },
        { status: 400 }
      );
    }

    // Validação de email format
    const { firstInvalidEmail } = await import('@/lib/email/validation')
    const invalid = firstInvalidEmail([from_email, reply_to])
    if (invalid) {
      return NextResponse.json(
        { error: `Email inválido: ${invalid}` },
        { status: 400 }
      );
    }

    const insertData: Record<string, any> = {
      organization_id: user.organization_id,
      name,
      subject: subject || name,
      status: 'draft',
    }
    if (template_id) insertData.template_id = template_id
    if (from_email) insertData.from_email = from_email
    if (sender_name) insertData.sender_name = sender_name
    if (reply_to) insertData.reply_to = reply_to
    if (segment_id) insertData.segment_id = segment_id
    if (store_id) insertData.store_id = store_id
    // A/B test fields
    if (body.ab_test_enabled) {
      insertData.ab_test_enabled = true
      insertData.ab_test_percent = body.ab_test_percent ?? 50
      insertData.ab_variant_b = body.ab_variant_b || null
      insertData.ab_winner_metric = body.ab_winner_metric || 'open_rate'
      insertData.ab_duration_hours = body.ab_duration_hours ?? 4
    }
    // Smart sending / engagement / send-time optimization
    if (typeof body.smart_sending_enabled === 'boolean') insertData.smart_sending_enabled = body.smart_sending_enabled
    if (typeof body.smart_sending_hours === 'number') insertData.smart_sending_hours = body.smart_sending_hours
    if (typeof body.skip_unengaged === 'boolean') insertData.skip_unengaged = body.skip_unengaged
    if (typeof body.skip_unengaged_days === 'number') insertData.skip_unengaged_days = body.skip_unengaged_days
    if (typeof body.send_time_optimization === 'boolean') insertData.send_time_optimization = body.send_time_optimization
    // Agendamento
    if (body.scheduled_at) {
      insertData.scheduled_at = body.scheduled_at
      insertData.status = 'scheduled'
    }

    const { data: campaign, error } = await supabaseAdmin
      .from('email_campaigns')
      .insert(insertData)
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
