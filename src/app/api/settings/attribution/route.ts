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
  model: 'last_touch' as 'last_touch' | 'first_touch',
};

const VALID_MODELS = ['last_touch', 'first_touch'] as const;

function clampWindow(value: any, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(90, Math.max(1, Math.round(n)));
}

function validateModel(value: any): 'last_touch' | 'first_touch' {
  if (VALID_MODELS.includes(value)) return value;
  return 'last_touch';
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

async function saveAttribution(orgId: string, body: any) {
  const supabase = getSupabaseClient();
  if (!supabase) return { error: 'DB not configured', status: 503 };

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
    model: validateModel(body.model),
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
  if (error) return { error: error.message, status: 500 };
  return { data: newAttribution };
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json();
  try {
    const result = await saveAttribution(orgId, body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, saved: result.data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;
  const body = await request.json();
  try {
    const result = await saveAttribution(orgId, body);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true, saved: result.data });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
