// =============================================
// WORDER: Verify Email Domain
// POST: trigger domain verification via Resend REST API.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { domainId } = await request.json();

    if (!domainId) {
      return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
    }

    const { data: dbDomain, error: fetchError } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', domainId)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !dbDomain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    if (!dbDomain.resend_domain_id) {
      return NextResponse.json({ error: 'Domain has no Resend ID. Re-add the domain.' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const resendId = dbDomain.resend_domain_id;

    // 1. Trigger verify
    const verifyRes = await fetch(`https://api.resend.com/domains/${resendId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });
    // Verify pode retornar 200 ou 400 se já verificado — ambos OK
    const verifyBody = await verifyRes.json().catch(() => ({}));

    // 2. Get domain status atualizado
    const getRes = await fetch(`https://api.resend.com/domains/${resendId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!getRes.ok) {
      const errBody = await getRes.json().catch(() => ({}));
      return NextResponse.json({
        error: `Failed to get domain status: ${getRes.status}`,
        details: errBody,
      }, { status: 500 });
    }

    const resendDomain = await getRes.json();

    // 3. Mapear status Resend → nosso schema
    // Resend retorna: not_started | pending | verified | failed | temporary_failure
    const resendStatus = String(resendDomain.status || '').toLowerCase();
    let ourStatus: 'pending' | 'verified' | 'failed' = 'pending';
    if (resendStatus === 'verified') ourStatus = 'verified';
    else if (resendStatus === 'failed' || resendStatus === 'temporary_failure') ourStatus = 'failed';

    // 4. Extrair DNS records do Resend (pode estar em .records ou .dns)
    const dnsRecords = resendDomain.records || resendDomain.dns || dbDomain.dns_records || [];

    // 5. Update DB
    const updates: Record<string, any> = {
      status: ourStatus,
      dns_records: dnsRecords,
    };
    if (ourStatus === 'verified') {
      updates.verified_at = new Date().toISOString();
    }

    const { data: updatedDomain, error: updateError } = await supabaseAdmin
      .from('email_domains')
      .update(updates)
      .eq('id', domainId)
      .eq('organization_id', user.organization_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json({ error: 'Failed to update domain in DB' }, { status: 500 });
    }

    return NextResponse.json({
      domain: updatedDomain,
      resend: {
        status: resendDomain.status,
        region: resendDomain.region,
        created_at: resendDomain.created_at,
      },
    });
  } catch (error: any) {
    console.error('[VerifyDomain] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
