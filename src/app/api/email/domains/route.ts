// =============================================
// WORDER: Email Domains API
// /src/app/api/email/domains/route.ts
//
// GET: list domains, POST: create domain.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createDomain, getDomain } from '@/lib/email/resend';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    const { data: domains, error } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('organization_id', user.organization_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[EmailDomains] Error fetching domains:', error);
      return NextResponse.json({ error: 'Failed to fetch domains' }, { status: 500 });
    }

    return NextResponse.json({ domains: domains || [] });
  } catch (error) {
    console.error('[EmailDomains] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const { domain } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    // Create domain in Resend
    const resendDomain = await createDomain(domain);

    // Store in our database
    const { data: dbDomain, error } = await supabaseAdmin
      .from('email_domains')
      .insert({
        organization_id: user.organization_id,
        domain,
        resend_domain_id: resendDomain?.id || null,
        status: 'pending',
        dns_records: resendDomain?.records || [],
      })
      .select()
      .single();

    if (error) {
      console.error('[EmailDomains] Error creating domain:', error);
      return NextResponse.json({ error: 'Failed to save domain' }, { status: 500 });
    }

    return NextResponse.json({ domain: dbDomain }, { status: 201 });
  } catch (error: any) {
    console.error('[EmailDomains] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
