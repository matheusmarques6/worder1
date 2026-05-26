import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

async function requireAdmin() {
  const auth = await getAuthClient();
  if (!auth) return null;

  if (auth.user.role !== 'admin' && auth.user.role !== 'super_admin') {
    return null;
  }

  return auth;
}

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth) {
    return authError('Admin access required', 403);
  }

  try {
    const body = await req.json();
    const { organizationId } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId is required' }, { status: 400 });
    }

    // Verify the organization exists
    const { data: org, error: orgErr } = await supabaseAdmin
      .from('organizations')
      .select('id, name')
      .eq('id', organizationId)
      .single();

    if (orgErr || !org) {
      return NextResponse.json({ error: 'Organization not found' }, { status: 404 });
    }

    // Fetch current Evolution API instances for this org
    const { data: instances, error: fetchErr } = await supabaseAdmin
      .from('whatsapp_instances')
      .select('id, instance_name, phone_number, status')
      .eq('organization_id', organizationId)
      .neq('status', 'disconnected');

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!instances || instances.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'No active Evolution instances to disconnect',
        disconnected: 0,
      });
    }

    // Disconnect all Evolution instances
    const { error: updateErr, count } = await supabaseAdmin
      .from('whatsapp_instances')
      .update({
        status: 'disconnected',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .neq('status', 'disconnected');

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Log the cutover action
    try {
      await supabaseAdmin.from('activity_logs').insert({
        organization_id: organizationId,
        entity_type: 'whatsapp_cutover',
        entity_id: organizationId,
        action: 'evolution_cutover',
        changes: {
          disconnected_instances: instances.map((i: any) => ({
            id: i.id,
            name: i.instance_name,
            phone: i.phone_number,
            previous_status: i.status,
          })),
          performed_by: auth.user.email,
          performed_at: new Date().toISOString(),
        },
      });
    } catch {
      // activity_logs table may not exist
      console.log('[cutover] Could not log to activity_logs');
    }

    console.log(
      `[cutover] Disconnected ${instances.length} Evolution instance(s) for org "${org.name}" (${organizationId}) by ${auth.user.email}`
    );

    return NextResponse.json({
      ok: true,
      organization: { id: org.id, name: org.name },
      disconnected: instances.length,
      instances: instances.map((i: any) => ({
        id: i.id,
        instance_name: i.instance_name,
        phone_number: i.phone_number,
        previous_status: i.status,
        new_status: 'disconnected',
      })),
    });
  } catch (error: any) {
    console.error('[cutover] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
