import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function requireAdmin(req: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return null;

  if (auth.user.role !== 'admin' && auth.user.role !== 'super_admin') {
    return null;
  }

  return auth;
}

export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth) {
    return authError('Admin access required', 403);
  }

  try {
    const { searchParams } = new URL(req.url);
    const section = searchParams.get('section') || 'overview';

    switch (section) {
      case 'overview':
        return getOverview();
      case 'accounts':
        return getAccountDetails();
      default:
        return NextResponse.json({ error: 'Invalid section' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[admin/whatsapp-health] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

async function getOverview() {
  // 1. Fetch all WABA accounts with org info
  const { data: accounts, error: accErr } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select(`
      id,
      waba_id,
      phone_number_id,
      display_phone_number,
      verified_name,
      quality_rating,
      messaging_limit_tier,
      status,
      organization_id,
      created_at
    `)
    .order('created_at', { ascending: false });

  if (accErr) {
    return NextResponse.json({ error: accErr.message }, { status: 500 });
  }

  if (!accounts || accounts.length === 0) {
    return NextResponse.json({
      total_accounts: 0,
      accounts: [],
      quality_summary: { green: 0, yellow: 0, red: 0, unknown: 0 },
      message_stats: { total_7d: 0 },
    });
  }

  // 2. Fetch org names for each unique org
  const orgIds = [...new Set(accounts.map((a: any) => a.organization_id).filter(Boolean))];
  const { data: orgs } = await supabaseAdmin
    .from('organizations')
    .select('id, name')
    .in('id', orgIds);

  const orgMap = new Map((orgs || []).map((o: any) => [o.id, o.name]));

  // 3. Count approved templates per WABA
  const wabaIds = accounts.map((a: any) => a.id).filter(Boolean);
  const { data: templateCounts } = await supabaseAdmin
    .from('whatsapp_templates')
    .select('waba_id')
    .in('waba_id', wabaIds)
    .eq('status', 'APPROVED');

  const templateCountMap = new Map<string, number>();
  for (const t of templateCounts || []) {
    templateCountMap.set(t.waba_id, (templateCountMap.get(t.waba_id) || 0) + 1);
  }

  // 4. Count messages in last 7 days per account
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const phoneIds = accounts.map((a: any) => a.phone_number_id).filter(Boolean);

  let messageCountMap = new Map<string, number>();
  let totalMessages7d = 0;

  if (phoneIds.length > 0) {
    const { count } = await supabaseAdmin
      .from('whatsapp_messages')
      .select('*', { count: 'exact', head: true })
      .in('phone_number_id', phoneIds)
      .gte('created_at', sevenDaysAgo);

    totalMessages7d = count || 0;
  }

  // 5. Quality summary
  const qualitySummary = {
    green: accounts.filter((a: any) => a.quality_rating === 'GREEN').length,
    yellow: accounts.filter((a: any) => a.quality_rating === 'YELLOW').length,
    red: accounts.filter((a: any) => a.quality_rating === 'RED').length,
    unknown: accounts.filter((a: any) => !a.quality_rating || a.quality_rating === 'UNKNOWN').length,
  };

  // 6. Build response
  const enrichedAccounts = accounts.map((a: any) => ({
    id: a.id,
    waba_id: a.waba_id,
    phone_number_id: a.phone_number_id,
    display_phone_number: a.display_phone_number,
    verified_name: a.verified_name,
    quality_rating: a.quality_rating || 'UNKNOWN',
    messaging_limit_tier: a.messaging_limit_tier || 'UNKNOWN',
    status: a.status,
    organization_id: a.organization_id,
    organization_name: orgMap.get(a.organization_id) || null,
    approved_templates: templateCountMap.get(a.id) || 0,
    created_at: a.created_at,
  }));

  return NextResponse.json({
    total_accounts: accounts.length,
    accounts: enrichedAccounts,
    quality_summary: qualitySummary,
    message_stats: { total_7d: totalMessages7d },
  });
}

async function getAccountDetails() {
  // Detailed per-account view with recent quality history
  const { data: accounts, error } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data: qualityHistory } = await supabaseAdmin
    .from('whatsapp_quality_history')
    .select('phone_number_id, quality_rating, checked_at, rating_changed')
    .gte('checked_at', thirtyDaysAgo)
    .order('checked_at', { ascending: false })
    .limit(500);

  const historyByPhone = new Map<string, any[]>();
  for (const h of qualityHistory || []) {
    if (!historyByPhone.has(h.phone_number_id)) {
      historyByPhone.set(h.phone_number_id, []);
    }
    historyByPhone.get(h.phone_number_id)!.push(h);
  }

  return NextResponse.json({
    accounts: (accounts || []).map((a: any) => ({
      ...a,
      access_token: undefined,
      access_token_encrypted: undefined,
      webhook_verify_token: undefined,
      recent_quality_history: historyByPhone.get(a.phone_number_id) || [],
    })),
  });
}
