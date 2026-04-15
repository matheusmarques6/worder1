// =============================================
// WORDER: Verify Email Domain
// /src/app/api/email/domains/verify/route.ts
//
// POST: trigger domain verification via Resend.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { verifyDomain, getDomain } from '@/lib/email/resend';

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { domainId } = await request.json();

    if (!domainId) {
      return NextResponse.json({ error: 'domainId is required' }, { status: 400 });
    }

    // Get domain from our DB
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

    // Trigger verification in Resend
    await verifyDomain(dbDomain.resend_domain_id);

    // Get updated status from Resend
    const resendDomain: any = await getDomain(dbDomain.resend_domain_id);
    const records: any[] = resendDomain?.records || dbDomain.dns_records || [];

    // Derive per-record DKIM / SPF / DMARC status from Resend's DNS record list.
    // Resend records carry `record` (SPF / DKIM / MX / DMARC) and `status`.
    const statusFor = (kind: string): string => {
      const hit = records.find((r: any) => {
        const label = String(r?.record || r?.type || '').toUpperCase();
        return label.includes(kind);
      });
      const raw = String(hit?.status || 'pending').toLowerCase();
      if (raw === 'verified' || raw === 'success') return 'verified';
      if (raw === 'failed' || raw === 'failure') return 'failed';
      return 'pending';
    };

    const spfStatus = statusFor('SPF');
    const dkimStatus = statusFor('DKIM');
    const dmarcStatus = statusFor('DMARC');

    const { data: updatedDomain, error: updateError } = await supabaseAdmin
      .from('email_domains')
      .update({
        status: resendDomain?.status || 'pending',
        dns_records: records,
        spf: spfStatus,
        dkim: dkimStatus,
        dmarc: dmarcStatus,
        last_verified_at: new Date().toISOString(),
        verified_at: resendDomain?.status === 'verified' ? new Date().toISOString() : null,
      })
      .eq('id', domainId)
      .select()
      .single();

    if (updateError) {
      console.error('[VerifyDomain] Error updating domain:', updateError);
      return NextResponse.json({ error: 'Failed to update domain' }, { status: 500 });
    }

    return NextResponse.json({ domain: updatedDomain });
  } catch (error: any) {
    console.error('[VerifyDomain] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
