// =============================================
// WORDER: Verify Email Domain
// POST { domainId, mode?: 'verify' | 'poll' }
//   verify → pede ao Resend para re-verificar (com cooldown) + confere o DNS
//   poll   → só confere DNS + status atual no Resend (barato; o assistente usa a cada 30 s)
// Resposta: { domain, records[], dmarc, resend_status, our_status }
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyEmailDomain } from '@/lib/email/domain-dns-check';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    const { user } = auth;
    const body = await request.json().catch(() => ({}));
    const domainId = body?.domainId;
    const mode = body?.mode === 'poll' ? 'poll' : 'verify';
    if (!domainId) return NextResponse.json({ error: 'domainId is required' }, { status: 400 });

    const { data: dbDomain, error: fetchError } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', domainId)
      .eq('organization_id', user.organization_id)
      .single();
    if (fetchError || !dbDomain) return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    if (dbDomain.is_system) return NextResponse.json({ error: 'Domínio compartilhado da plataforma — já verificado.' }, { status: 400 });
    if (!dbDomain.resend_domain_id) return NextResponse.json({ error: 'Domain has no Resend ID' }, { status: 400 });

    const result = await verifyEmailDomain(dbDomain, { trigger: mode === 'verify' });
    const { data: updated } = await supabaseAdmin.from('email_domains').select('*').eq('id', domainId).single();

    return NextResponse.json({
      domain: updated || { ...dbDomain, status: result.status, dns_records: result.dns_records },
      records: result.records,
      dmarc: result.dmarc,
      resend_status: result.resend_status,
      resend_error: result.resend_error || null,
      our_status: result.status,
      checked_at: result.checked_at,
    });
  } catch (error: any) {
    console.error('[VerifyDomain] Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
