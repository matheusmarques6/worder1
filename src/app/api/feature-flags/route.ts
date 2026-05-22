/**
 * Per-tenant feature flag lookup.
 *
 * GET /api/feature-flags?key=<flag>   → { enabled: boolean }
 * GET /api/feature-flags              → { flags: { ...all } }
 *
 * Authenticated; derives organization_id from the JWT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { isFeatureEnabled, getFeatureFlags } from '@/lib/feature-flags';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .single();

  if (!profile?.organization_id) {
    return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const key = searchParams.get('key');

  if (key) {
    const enabled = await isFeatureEnabled(profile.organization_id, key);
    return NextResponse.json({ key, enabled });
  }

  const flags = await getFeatureFlags(profile.organization_id);
  return NextResponse.json({ flags });
}
