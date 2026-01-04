import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const { data, error } = await supabase
      .from('whatsapp_ai_configs')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return NextResponse.json({ config: data || null });
  } catch (error: any) {
    console.error('WhatsApp AI GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { enabled, model, system_prompt, temperature, max_tokens, instance_id } = body;

    const { data, error } = await supabase
      .from('whatsapp_ai_configs')
      .upsert({
        organization_id: organizationId,
        instance_id,
        enabled: enabled ?? true,
        model: model || 'gpt-4o-mini',
        system_prompt: system_prompt || '',
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 1000,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'organization_id' })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ config: data });
  } catch (error: any) {
    console.error('WhatsApp AI POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
