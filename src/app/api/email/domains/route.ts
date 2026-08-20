// =============================================
// WORDER: Email Domains API
// /src/app/api/email/domains/route.ts
//
// GET: list domains visible to the active store:
//        - is_system rows (worder.email — every merchant uses by default)
//        - + the merchant's own custom domains for this specific store
//          (store_id matches the storeId query param) OR org-shared
//          custom domains (store_id IS NULL).
//      Multi-store merchants used to see the sibling store's sender
//      config; the store_id filter closes that leak.
//
// POST: create a custom domain in Resend + persist it scoped to a
//       store. A system domain cannot be created twice.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { createDomain } from '@/lib/email/resend';

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;
    const storeId = request.nextUrl.searchParams.get('storeId');

    // The OR filter is the union:
    //   is_system=true                          (worder.email global)
    //   OR (org-owned + store match OR shared)  (custom domains)
    // We can't express that in a single PostgREST .or() because of
    // the AND nesting, so we fetch both sets in parallel.
    const [systemRes, orgRes] = await Promise.all([
      supabaseAdmin
        .from('email_domains')
        .select('*')
        .eq('is_system', true),
      supabaseAdmin
        .from('email_domains')
        .select('*')
        .eq('organization_id', user.organization_id)
        .order('created_at', { ascending: false }),
    ]);

    if (systemRes.error) console.error('[EmailDomains] system fetch error:', systemRes.error);
    if (orgRes.error) console.error('[EmailDomains] org fetch error:', orgRes.error);

    const orgDomains = (orgRes.data || []).filter((d: any) => {
      // Org-shared custom domains (store_id IS NULL) show on every store.
      // Store-scoped customs only when the storeId matches.
      if (!d.store_id) return true;
      if (!storeId) return false;
      return d.store_id === storeId;
    });

    // System rows first so the merchant always sees the ready-to-use
    // default at the top of the list.
    const domains = [...(systemRes.data || []), ...orgDomains];

    return NextResponse.json({ domains });
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
    const { domain, storeId } = await request.json();

    if (!domain) {
      return NextResponse.json({ error: 'Domain is required' }, { status: 400 });
    }

    // Prevent shadowing of the platform domain. If a merchant types
    // 'worder.email' we'd silently create a second Resend record.
    if (String(domain).trim().toLowerCase() === 'worder.email') {
      return NextResponse.json(
        { error: 'worder.email é um domínio do sistema. Use um domínio próprio.' },
        { status: 400 }
      );
    }

    // Create domain in Resend
    const resendDomain = await createDomain(domain);

    // Tracking da Resend desligado por padrão: o tracking primário é o
    // da Worder (/api/t/*, com atribuição). Ligado junto, cada clique
    // vira redirect duplo e cada abertura conta duas vezes.
    if (resendDomain?.id) {
      try {
        const { setDomainTracking } = await import('@/lib/email/resend');
        await setDomainTracking(resendDomain.id, { clickTracking: false, openTracking: false });
      } catch (e: any) {
        console.warn('[EmailDomains] setDomainTracking failed (segue sem bloquear):', e?.message);
      }
    }

    // Persist scoped to the store. storeId is optional — null means
    // the domain is shared across every store in the org.
    const { data: dbDomain, error } = await supabaseAdmin
      .from('email_domains')
      .insert({
        organization_id: user.organization_id,
        store_id: storeId || null,
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
