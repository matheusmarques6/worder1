// =============================================
// WORDER: Email Domain Single-item
// /src/app/api/email/domains/[id]/route.ts
//
// DELETE: remove domain (Resend + DB).
// GET:    fetch single domain.
// PATCH:  subdomínio dos links (o host que o destinatário VÊ).
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  validarSubdominioDeLinks,
  subdominioDeLinksPadrao,
} from '@/lib/email/tracking-subdomain';

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

// =============================================
// PATCH — subdomínio dos links
//
// É o host que o destinatário vê: o Resend reescreve cada link no
// envio, depois do nosso render, então quem aparece é ele. Alinhar esse
// host com o domínio de envio é o que a entregabilidade pede — e custa
// UM CNAME no mesmo DNS onde o lojista já publicou SPF e DKIM.
//
// O nosso /api/t/* não muda: continua no salto seguinte, carimbando a
// atribuição. Ver src/lib/email/tracking-subdomain.ts.
// =============================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const auth = await getAuthClient();
    if (!auth) return authError();
    const { user } = auth;

    const body = await req.json().catch(() => ({}));

    // Só domínio DA organização: o do sistema (worder.email) é comum a
    // todo mundo e não se mexe por aqui.
    const { data: domain } = await supabaseAdmin
      .from('email_domains')
      .select('*')
      .eq('id', params.id)
      .eq('organization_id', user.organization_id)
      .maybeSingle();

    if (!domain) {
      return NextResponse.json({ error: 'Domínio não encontrado' }, { status: 404 });
    }
    if (domain.is_system) {
      return NextResponse.json(
        { error: 'O domínio do sistema não pode ser alterado.' },
        { status: 400 },
      );
    }

    const validacao = validarSubdominioDeLinks(domain.domain, body?.tracking_subdomain);
    if (!validacao.ok) {
      return NextResponse.json({ error: validacao.erro }, { status: 400 });
    }
    const subdominio = validacao.valor || subdominioDeLinksPadrao(domain.domain);

    if (!domain.resend_domain_id) {
      return NextResponse.json(
        { error: 'Domínio ainda não foi criado no provedor de envio.' },
        { status: 409 },
      );
    }

    // Grava no Resend primeiro: se ele recusar, não guardamos no banco
    // uma configuração que não existe do outro lado.
    try {
      const { setDomainTracking } = await import('@/lib/email/resend');
      await setDomainTracking(domain.resend_domain_id, {
        clickTracking: body?.click_tracking !== false,
        openTracking: body?.open_tracking !== false,
        trackingSubdomain: subdominio,
      });
    } catch (e: any) {
      return NextResponse.json(
        { error: e?.message || 'O provedor de envio recusou a alteração' },
        { status: 502 },
      );
    }

    // Recarrega o domínio no Resend: é de lá que vem o CNAME novo que o
    // lojista precisa publicar.
    let registros = domain.dns_records;
    try {
      const { getDomain } = await import('@/lib/email/resend');
      const atualizado = await getDomain(domain.resend_domain_id);
      if (Array.isArray(atualizado?.records)) registros = atualizado.records;
    } catch (e: any) {
      console.warn('[EmailDomains/PATCH] falha ao reler o domínio:', e?.message);
    }

    const { data: salvo, error: saveErr } = await supabaseAdmin
      .from('email_domains')
      .update({
        dns_records: registros,
        tracking_config: {
          ...(domain.tracking_config || {}),
          tracking_subdomain: subdominio,
          click_tracking: body?.click_tracking !== false,
          open_tracking: body?.open_tracking !== false,
          updated_at: new Date().toISOString(),
        },
      })
      .eq('id', domain.id)
      .select()
      .single();

    if (saveErr) {
      return NextResponse.json({ error: saveErr.message }, { status: 500 });
    }

    return NextResponse.json({ domain: salvo, tracking_subdomain: subdominio });
  } catch (error: any) {
    console.error('[EmailDomains/PATCH] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 },
    );
  }
}
