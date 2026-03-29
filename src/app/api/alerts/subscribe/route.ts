import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { org_id, product_id, product_title, email, alert_type = 'back_in_stock' } = body;

    if (!org_id || !product_id || !email) {
      return NextResponse.json({ error: 'org_id, product_id, email required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ error: 'DB not configured' }, { status: 503, headers: corsHeaders });
    }

    // Upsert contact
    let contactId: string | null = null;
    try {
      const { data: existing } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', org_id)
        .eq('email', email)
        .single();

      if (existing) {
        contactId = existing.id;
      } else {
        const { data: created } = await supabase
          .from('contacts')
          .insert({ organization_id: org_id, email, source: 'product_alert' })
          .select('id')
          .single();
        contactId = created?.id || null;
      }
    } catch {}

    // Insert product alert
    try {
      await supabase.from('product_alerts').insert({
        organization_id: org_id,
        product_id,
        product_title: product_title || null,
        contact_id: contactId,
        email,
        alert_type,
        status: 'active',
      });
    } catch (e: any) {
      // May already exist
      if (e?.message?.includes('duplicate')) {
        return NextResponse.json({ success: true, message: 'Already subscribed' }, { headers: corsHeaders });
      }
    }

    return NextResponse.json({ success: true }, { headers: corsHeaders });
  } catch (e: any) {
    return NextResponse.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders });
  }
}
