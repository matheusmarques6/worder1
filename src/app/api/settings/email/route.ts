import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, getSupabaseClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ domains: [], senderSettings: null, servers: [] });

    const [{ data: orgData }, { data: domains }, { data: servers }] = await Promise.all([
      supabase
        .from('organizations')
        .select('email_settings')
        .eq('id', orgId)
        .single(),
      supabase
        .from('sending_domains')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
      supabase
        .from('sending_servers')
        .select('*')
        .eq('organization_id', orgId)
        .order('created_at', { ascending: false }),
    ]);

    const emailSettings = (orgData as any)?.email_settings ?? null;

    return NextResponse.json({
      domains: domains ?? [],
      senderSettings: emailSettings
        ? {
            sender_name: emailSettings.sender_name ?? '',
            sender_email: emailSettings.sender_email ?? '',
            reply_to: emailSettings.reply_to ?? '',
          }
        : { sender_name: '', sender_email: '', reply_to: '' },
      servers: servers ?? [],
    });
  } catch (e: any) {
    console.error('[settings/email GET]', e);
    return NextResponse.json({ domains: [], senderSettings: null, servers: [] });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { type, ...fields } = body;

    const supabase = getSupabaseClient();
    if (!supabase) return NextResponse.json({ error: 'DB not configured' }, { status: 503 });

    if (type === 'sender') {
      const { sender_name, sender_email, reply_to } = fields;

      // Fetch existing email_settings then merge
      const { data: orgData } = await supabase
        .from('organizations')
        .select('email_settings')
        .eq('id', orgId)
        .single();

      const existing = (orgData as any)?.email_settings ?? {};
      const updated = { ...existing, sender_name, sender_email, reply_to };

      const { error } = await supabase
        .from('organizations')
        .update({ email_settings: updated })
        .eq('id', orgId);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === 'add_domain') {
      const { domain } = fields;
      if (!domain) return NextResponse.json({ error: 'domain is required' }, { status: 400 });

      const { data, error } = await supabase
        .from('sending_domains')
        .insert({ organization_id: orgId, domain, status: 'pending' })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, domain: data });
    }

    if (type === 'verify_domain') {
      const { domain_id } = fields;
      if (!domain_id) return NextResponse.json({ error: 'domain_id is required' }, { status: 400 });

      // In a real implementation this would trigger DNS verification
      const { error } = await supabase
        .from('sending_domains')
        .update({ status: 'pending', verified_at: null })
        .eq('id', domain_id)
        .eq('organization_id', orgId);

      if (error) throw error;
      return NextResponse.json({ ok: true, message: 'Verificação iniciada' });
    }

    if (type === 'delete_domain') {
      const { domain_id } = fields;
      if (!domain_id) return NextResponse.json({ error: 'domain_id is required' }, { status: 400 });

      const { error } = await supabase
        .from('sending_domains')
        .delete()
        .eq('id', domain_id)
        .eq('organization_id', orgId);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    if (type === 'add_server') {
      const { name, host, port, username, provider } = fields;
      const { data, error } = await supabase
        .from('sending_servers')
        .insert({ organization_id: orgId, name, host, port, username, provider, status: 'active' })
        .select()
        .single();

      if (error) throw error;
      return NextResponse.json({ ok: true, server: data });
    }

    if (type === 'delete_server') {
      const { server_id } = fields;
      if (!server_id) return NextResponse.json({ error: 'server_id is required' }, { status: 400 });

      const { error } = await supabase
        .from('sending_servers')
        .delete()
        .eq('id', server_id)
        .eq('organization_id', orgId);

      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (e: any) {
    console.error('[settings/email POST]', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
