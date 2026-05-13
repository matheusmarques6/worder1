// =============================================
// WORDER: Email Domain Single-item
// /src/app/api/email/domains/[id]/route.ts
//
// DELETE: remove domain (Resend + DB).
// GET:    fetch single domain.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    // Allow either an org-scoped row OR a system (worder.email) row.
    // System rows have organization_id IS NULL and are visible to
    // every tenant; the single-item GET shouldn't 404 them.
    const { data: domain, error } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', params.id)
      .or(`organization_id.eq.${user.organization_id},is_system.eq.true`)
      .maybeSingle();

    if (error || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    return NextResponse.json({ domain });
  } catch (error: any) {
    console.error('[EmailDomains/GET] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    // Tenant isolation: só podemos remover domínio que pertence à org do user.
    // System domains (worder.email) live on a different row shape
    // (organization_id IS NULL, is_system=true) and are not removable
    // by tenants — they're managed by the platform.
    const { data: domain, error: fetchError } = await supabaseAdmin
      .from('email_domains')
      .select('id, resend_domain_id, organization_id, is_system')
      .eq('id', params.id)
      .single();

    if (fetchError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    if (domain.is_system) {
      return NextResponse.json(
        { error: 'worder.email é um domínio do sistema e não pode ser removido.' },
        { status: 403 }
      );
    }

    if (domain.organization_id !== user.organization_id) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Remover no Resend via REST (best-effort)
    if (domain.resend_domain_id) {
      try {
        const apiKey = process.env.RESEND_API_KEY;
        if (apiKey) {
          const res = await fetch(`https://api.resend.com/domains/${domain.resend_domain_id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${apiKey}` },
          });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            console.warn('[EmailDomains/DELETE] Resend delete failed:', res.status, body);
          }
        }
      } catch (err: any) {
        console.warn('[EmailDomains/DELETE] Resend delete error:', err?.message);
      }
    }

    const { error: delError } = await supabaseAdmin
      .from('email_domains')
      .delete()
      .eq('id', params.id)
      .eq('organization_id', user.organization_id);

    if (delError) {
      console.error('[EmailDomains/DELETE] DB delete error:', delError);
      return NextResponse.json({ error: 'Failed to delete domain' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('[EmailDomains/DELETE] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
