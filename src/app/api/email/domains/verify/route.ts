// =============================================
// WORDER: Verify Email Domain
// POST: trigger verification + sync status from Resend
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
      return NextResponse.json({ error: 'Domain has no Resend ID' }, { status: 400 });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 });
    }

    const resendId = dbDomain.resend_domain_id;

    // 1. Trigger verify (pode retornar 200 ou erro se já verificado)
    await fetch(`https://api.resend.com/domains/${resendId}/verify`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}` },
    }).catch(() => {});

    // 2. Delay 2s para Resend propagar o status
    await new Promise(resolve => setTimeout(resolve, 2000));

    // 3. Get domain status atualizado
    const getRes = await fetch(`https://api.resend.com/domains/${resendId}`, {
      headers: { 'Authorization': `Bearer ${apiKey}` },
    });

    if (!getRes.ok) {
      return NextResponse.json({ error: `Resend API error: ${getRes.status}` }, { status: 500 });
    }

    const resendDomain = await getRes.json();
    console.log('[VerifyDomain] Resend response:', JSON.stringify({
      id: resendDomain.id,
      status: resendDomain.status,
      region: resendDomain.region,
    }));

    // 4. Mapear status — Resend pode retornar variantes
    const rawStatus = String(resendDomain.status || '').toLowerCase().trim();
    let ourStatus: 'pending' | 'verified' | 'failed' = 'pending';
    if (rawStatus === 'verified' || rawStatus === 'active') {
      ourStatus = 'verified';
    } else if (rawStatus === 'failed' || rawStatus === 'temporary_failure') {
      ourStatus = 'failed';
    }
    // Se não mudou mas Resend diz not_started, mantém pending

    // 5. Extrair DNS + tracking config
    const dnsRecords = resendDomain.records || resendDomain.dns || dbDomain.dns_records || [];

    // 6. Update DB com tudo
    const updates: Record<string, any> = {
      status: ourStatus,
      dns_records: dnsRecords,
    };
    if (ourStatus === 'verified') {
      updates.verified_at = new Date().toISOString();
    }
    // Salvar tracking config do Resend se disponível
    if (resendDomain.open_tracking !== undefined || resendDomain.click_tracking !== undefined) {
      updates.tracking_config = {
        open_tracking: resendDomain.open_tracking ?? false,
        click_tracking: resendDomain.click_tracking ?? false,
        tls: resendDomain.tls || 'opportunistic',
        region: resendDomain.region || 'us-east-1',
      };
    }

    const { data: updatedDomain, error: updateError } = await supabaseAdmin
      .from('email_domains')
      .update(updates)
      .eq('id', domainId)
      .eq('organization_id', user.organization_id)
      .select()
      .single();

    if (updateError) {
      // Pode ser que tracking_config não existe como coluna — tenta sem
      console.warn('[VerifyDomain] Update with tracking failed, retrying without:', updateError.message);
      delete updates.tracking_config;
      const { data: retry, error: retryErr } = await supabaseAdmin
        .from('email_domains')
        .update(updates)
        .eq('id', domainId)
        .eq('organization_id', user.organization_id)
        .select()
        .single();
      if (retryErr) {
        return NextResponse.json({ error: 'Failed to update domain' }, { status: 500 });
      }
      return NextResponse.json({
        domain: retry,
        resend_status: rawStatus,
        our_status: ourStatus,
      });
    }

    return NextResponse.json({
      domain: updatedDomain,
      resend_status: rawStatus,
      our_status: ourStatus,
    });
  } catch (error: any) {
    console.error('[VerifyDomain] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
