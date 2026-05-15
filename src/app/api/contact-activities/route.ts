import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  const { searchParams } = new URL(request.url);
  const orgParam = searchParams.get('organizationId') || searchParams.get('organization_id');
  if (orgParam && orgParam !== organizationId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const contactId = searchParams.get('contactId');
  const storeId = searchParams.get('storeId') || searchParams.get('store_id');
  const limit = parseInt(searchParams.get('limit') || '50');

  try {
    // Activities don't have store_id directly, so we filter via the
    // contact's store. Without this, multi-store orgs saw activities
    // from sibling stores bleed into each other's CRM panels.
    let storeContactIds: string[] | null = null;
    if (storeId) {
      const { data: storeContacts } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`store_id.eq.${storeId},store_id.is.null`);
      storeContactIds = (storeContacts || []).map((c: any) => c.id);
      // Empty result → no rows possible. Skip the DB roundtrip below.
      if (storeContactIds.length === 0) {
        return NextResponse.json({ activities: [] });
      }
    }

    let query = supabase
      .from('contact_activities')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (contactId) {
      query = query.eq('contact_id', contactId);
    } else if (storeContactIds) {
      query = query.in('contact_id', storeContactIds);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ activities: data || [] });
  } catch (error: any) {
    console.error('Contact Activities GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const supabase = getSupabaseClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { contact_id, type, description, metadata } = body;

    if (!contact_id || !type) {
      return NextResponse.json({ error: 'contact_id and type required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('contact_activities')
      .insert({
        organization_id: organizationId,
        contact_id,
        type,
        description,
        metadata: metadata || {},
        user_id: auth.user.id,
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ activity: data }, { status: 201 });
  } catch (error: any) {
    console.error('Contact Activities POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
