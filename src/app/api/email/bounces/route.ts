import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  const { searchParams } = request.nextUrl;
  const storeId = searchParams.get('store_id') || searchParams.get('storeId');
  const page = parseInt(searchParams.get('page') || '1');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100);
  const type = searchParams.get('type'); // 'bounced', 'complained', 'invalid', or null for all

  try {
    let query = supabaseAdmin
      .from('contacts')
      .select('id, email, first_name, last_name, status, email_consent, updated_at, store_id', { count: 'exact' })
      .eq('organization_id', organizationId)
      .in('status', type ? [type] : ['bounced', 'complained', 'invalid'])
      .order('updated_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1);

    if (storeId) {
      query = query.eq('store_id', storeId);
    }

    const { data: contacts, count, error } = await query;

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Get bounce event details for these contacts
    const contactIds = (contacts || []).map((c: any) => c.id);
    let bounceDetails: Record<string, any> = {};
    if (contactIds.length > 0) {
      const { data: events } = await supabaseAdmin
        .from('email_sends')
        .select('contact_id, status, bounced_at, bounce_type, campaign_id')
        .in('contact_id', contactIds)
        .in('status', ['bounced', 'complained'])
        .order('bounced_at', { ascending: false });

      for (const e of (events || []) as any[]) {
        if (!bounceDetails[e.contact_id]) {
          bounceDetails[e.contact_id] = {
            bounce_type: e.bounce_type || e.status,
            bounced_at: e.bounced_at,
            campaign_id: e.campaign_id,
          };
        }
      }
    }

    const enriched = (contacts || []).map((c: any) => ({
      ...c,
      bounce_info: bounceDetails[c.id] || null,
    }));

    return NextResponse.json({
      contacts: enriched,
      total: count || 0,
      page,
      limit,
      totalPages: Math.ceil((count || 0) / limit),
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH: Clear bounce for a specific contact (reactivate)
export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const organizationId = auth.user.organization_id;

  try {
    const body = await request.json();
    const { contactIds } = body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return NextResponse.json({ error: 'contactIds array is required' }, { status: 400 });
    }

    if (contactIds.length > 100) {
      return NextResponse.json({ error: 'Maximum 100 contacts per request' }, { status: 400 });
    }

    const { data: updated, error } = await supabaseAdmin
      .from('contacts')
      .update({
        status: 'active',
        email_consent: true,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', organizationId)
      .in('id', contactIds)
      .in('status', ['bounced', 'complained', 'invalid'])
      .select('id, email, status');

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      reactivated: (updated || []).length,
      contacts: updated,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
