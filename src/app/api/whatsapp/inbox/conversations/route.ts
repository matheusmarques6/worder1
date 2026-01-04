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
    const status = searchParams.get('status') || 'open';
    const assignedTo = searchParams.get('assignedTo');
    const search = searchParams.get('search');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = supabase
      .from('whatsapp_conversations')
      .select(`
        *,
        contact:whatsapp_contacts(*),
        instance:whatsapp_instances(id, title, phone_number),
        assigned_agent:whatsapp_agents(id, name, avatar_url)
      `, { count: 'exact' })
      .eq('organization_id', organizationId)
      .eq('status', status)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (assignedTo) query = query.eq('assigned_to', assignedTo);

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      conversations: data || [],
      total: count || 0,
      page,
      limit
    });
  } catch (error: any) {
    console.error('Inbox Conversations GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
