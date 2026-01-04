import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin as supabase } from '@/lib/supabase-admin';
import { getAuthClient, authError } from '@/lib/api-utils';

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { api_type, api_url, api_key, phone_number, title, token } = body;

    if (!api_type) {
      return NextResponse.json({ error: 'api_type required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('whatsapp_instances')
      .insert({
        organization_id: organizationId,
        api_type,
        api_url,
        api_key,
        phone_number,
        title: title || 'WhatsApp',
        token,
        status: 'pending',
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ instance: data }, { status: 201 });
  } catch (error: any) {
    console.error('WhatsApp Connect POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
