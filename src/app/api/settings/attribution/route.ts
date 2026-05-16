import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// Defaults mirror Klaviyo's out-of-the-box behavior: 5-day windows for
// email/SMS, opens count, Apple MPP opens excluded. WhatsApp is a
// shorter conversational channel so we default 2 days.
const DEFAULTS = {
  email_window_days: 5,
  whatsapp_window_days: 2,
  sms_window_days: 2,
  count_opens: true,
  exclude_mpp_opens: true,
};

function clampWindow(value: any, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(30, Math.max(1, Math.round(n)));
}

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json(DEFAULTS);
    const { data: org } = await supabase
      .from('organizations')
      .select('email_settings')
      .eq('id', orgId)
      .single();
    const settings = org?.email_settings?.attribution || {};
    return NextResponse.json({ ...DEFAULTS, ...settings });
  } catch {
    return NextResponse.json(DEFAULTS);
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json();
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    const { data: org } = await supabase
      .from('organizations')
      .select('email_settings')
      .eq('id', orgId)
      .single();

    const existingSettings = org?.email_settings || {};
    const newAttribution = {
      email_window_days: clampWindow(body.email_window_days, 5),
      whatsapp_window_days: clampWindow(body.whatsapp_window_days, 2),
      sms_window_days: clampWindow(body.sms_window_days, 2),
      count_opens: body.count_opens !== false,
      exclude_mpp_opens: body.exclude_mpp_opens !== false,
    };
    const { error } = await supabase
      .from('organizations')
      .update({
        email_settings: {
          ...existingSettings,
          attribution: newAttribution,
        },
      })
      .eq('id', orgId);
    if (error) throw error;
    // Echo the saved values back so the form can render from the
    // response and the merchant SEES that the save actually
    // persisted (was returning bare {ok:true} which made the UI
    // feel broken — toggle flipped but no confirmation).
    return NextResponse.json({ ok: true, saved: newAttribution });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
