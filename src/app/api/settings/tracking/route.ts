import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

const DEFAULTS = {
  track_opens: true,
  track_clicks: true,
  track_anonymous: false,
  facebook_pixel_id: '',
  google_analytics_id: '',
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
    const settings = org?.email_settings?.tracking || {};
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

    // Fetch existing email_settings to merge
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
          tracking: {
            track_opens: body.track_opens ?? true,
            track_clicks: body.track_clicks ?? true,
            track_anonymous: body.track_anonymous ?? false,
            facebook_pixel_id: body.facebook_pixel_id || '',
            google_analytics_id: body.google_analytics_id || '',
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
