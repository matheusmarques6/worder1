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
import { Resend } from 'resend';

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();

    const { user } = auth;

    const { data: domain, error } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .single();

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

    // Tenant isolation: só podemos remover domínio que pertence à org do user
    const { data: domain, error: fetchError } = await supabaseAdmin
      .from('email_domains')
      .select('id, resend_domain_id, organization_id')
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .single();

    if (fetchError || !domain) {
      return NextResponse.json({ error: 'Domain not found' }, { status: 404 });
    }

    // Best-effort remoção no Resend (se falhar, seguimos e removemos no DB)
    if (domain.resend_domain_id) {
      const resend = getResend();
      if (resend) {
        try {
          const client: any = resend as any;
          await client.domains.remove(domain.resend_domain_id);
        } catch (err: any) {
          console.warn(
            '[EmailDomains/DELETE] Resend remove failed, removing locally anyway:',
            err?.message
          );
        }
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
