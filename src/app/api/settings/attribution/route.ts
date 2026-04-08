import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

const DEFAULTS = {
  email_window_days: 5,
  whatsapp_window_days: 2,
  sms_window_days: 2,
};

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
    const { error } = await supabase
      .from('organizations')
      .update({
        email_settings: {
          ...existingSettings,
          attribution: {
            email_window_days: Number(body.email_window_days) || 5,
            whatsapp_window_days: Number(body.whatsapp_window_days) || 2,
            sms_window_days: Number(body.sms_window_days) || 2,
          },
        },
      })
      .eq('id', orgId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
