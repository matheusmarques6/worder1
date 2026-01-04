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
    const status = searchParams.get('status');
    const instanceId = searchParams.get('instanceId');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(id, name, phone, avatar_url, tags),
        messages:whatsapp_messages(id, content, direction, created_at, status)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) query = query.eq('status', status);
    if (instanceId) query = query.eq('instance_id', instanceId);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      conversations: data || [],
      total: count || 0,
      page,
      limit,
      hasMore: (count || 0) > offset + limit
    });
  } catch (error: any) {
    console.error('Conversations GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
