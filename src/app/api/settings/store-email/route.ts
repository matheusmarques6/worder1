// =============================================
// GET/PATCH /api/settings/store-email
//
// Remetente por loja. Cada loja tem nome, e-mail e reply-to próprios —
// e, opcionalmente, o domínio dos links de tracking. Uma organização
// com duas vitrines não compartilha identidade entre elas.
//
// Storage:
//   shopify_stores.settings.email_settings = {
//     default_sender_name, default_sender_email, default_reply_to,
//     tracking_domain?
//   }
//
// Domínio compartilhado (worder.email): toda loja nasce com
// <nome-da-loja>@worder.email, único em toda a Worder. Aqui o GET
// garante isso para lojas antigas e o PATCH valida/reserva o nome que
// o lojista escolher (409 com sugestão quando outra loja já o usa).
// Domínio próprio: só os verificados da organização/loja.
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  ensureStoreSharedSender, sharedSenderDomain, isSharedDomainEmail, localPartOf, isValidLocalPart,
  checkLocalPartAvailability, reserveLocalPart, releaseOtherLocalParts, slugifyLocalPart,
} from '@/lib/email/shared-sender';

export const dynamic = 'force-dynamic';

async function loadStore(orgId: string, storeId: string) {
  return supabaseAdmin
    .from('shopify_stores')
    .select('id, organization_id, shop_name, shop_email, settings')
    .eq('id', storeId)
    .eq('organization_id', orgId)
    .maybeSingle();
}

function normalizeTrackingDomain(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  const v = String(raw).trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!v) return null;
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v)) return null;
  return v;
}

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const storeId = request.nextUrl.searchParams.get('storeId');
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const { data: store, error } = await loadStore(orgId, storeId);
  if (error || !store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  // Per-store config, nunca a da organização (que numa organização com
  // várias lojas é a identidade de outra loja). Loja ainda sem remetente
  // recebe agora o dela no domínio compartilhado.
  let settings: Record<string, any> = (store.settings as any)?.email_settings || {};
  let allocated = false;
  if (!settings.default_sender_email) {
    try {
      const r = await ensureStoreSharedSender(store.id);
      if (r) { settings = r.settings; allocated = r.allocated; }
    } catch (e) {
      console.error('[store-email GET] alocação do remetente compartilhado falhou:', (e as Error).message);
    }
  }

  return NextResponse.json({
    email_settings: settings,
    shared_domain: sharedSenderDomain(),
    is_shared_domain: isSharedDomainEmail(settings.default_sender_email),
    suggested_local_part: slugifyLocalPart(store.shop_name),
    allocated,
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const orgId = auth.user.organization_id;

  const body = await request.json().catch(() => ({}));
  const storeId = body?.storeId;
  const incoming = body?.email_settings || {};
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const { data: store, error: loadErr } = await loadStore(orgId, storeId);
  if (loadErr || !store) {
    return NextResponse.json({ error: 'Store not found' }, { status: 404 });
  }

  const prevSettings: any = (store.settings as any) || {};
  const prevEmail: any = prevSettings.email_settings || {};
  const patch: Record<string, any> = {};

  if (incoming.default_sender_name !== undefined) {
    patch.default_sender_name = String(incoming.default_sender_name || '').trim();
  }
  if (incoming.default_reply_to !== undefined) {
    const rt = String(incoming.default_reply_to || '').trim().toLowerCase();
    if (rt && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rt)) {
      return NextResponse.json({ error: 'Reply-to inválido' }, { status: 400 });
    }
    patch.default_reply_to = rt;
  }

  // Domínio dos links (tracking): opcional; vazio remove.
  if (incoming.tracking_domain !== undefined) {
    const raw = String(incoming.tracking_domain || '').trim();
    if (!raw) {
      patch.tracking_domain = null;
    } else {
      const td = normalizeTrackingDomain(raw);
      if (!td) return NextResponse.json({ error: 'Domínio de links inválido. Use algo como links.sualoja.com.br' }, { status: 400 });
      patch.tracking_domain = td;
    }
  }

  // E-mail do remetente.
  if (incoming.default_sender_email !== undefined) {
    const email = String(incoming.default_sender_email || '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'E-mail do remetente inválido' }, { status: 400 });
    }
    const domain = email.slice(email.lastIndexOf('@') + 1);

    if (isSharedDomainEmail(email)) {
      // Domínio compartilhado: o nome antes do @ é único na Worder.
      const local = localPartOf(email);
      if (!isValidLocalPart(local)) {
        return NextResponse.json({
          error: 'Use só letras minúsculas, números, ponto, hífen ou underscore antes do @.',
          code: 'invalid_local_part',
          suggestion: slugifyLocalPart(local || store.shop_name),
        }, { status: 400 });
      }
      const availability = await checkLocalPartAvailability(local, store.id);
      if (!availability.available) {
        return NextResponse.json({
          error: `${local}@${sharedSenderDomain()} já é usado por outra loja.`,
          code: 'local_part_taken',
          suggestion: availability.suggestion ? `${availability.suggestion}@${sharedSenderDomain()}` : undefined,
        }, { status: 409 });
      }
      const reserved = await reserveLocalPart(local, store.id, store.organization_id);
      if (!reserved) {
        // Corrida: outra loja reservou entre a consulta e a gravação.
        const again = await checkLocalPartAvailability(local, store.id);
        return NextResponse.json({
          error: `${local}@${sharedSenderDomain()} acabou de ser reservado por outra loja.`,
          code: 'local_part_taken',
          suggestion: again.suggestion ? `${again.suggestion}@${sharedSenderDomain()}` : undefined,
        }, { status: 409 });
      }
      await releaseOtherLocalParts(store.id, local);
    } else {
      // Domínio próprio: tem de estar verificado para esta organização
      // (da loja, ou compartilhado na organização).
      const { data: verified } = await supabaseAdmin
        .from('email_domains')
        .select('id, store_id, is_system')
        .eq('domain', domain)
        .eq('status', 'verified')
        .or(`is_system.eq.true,organization_id.eq.${orgId}`);
      const ok = (verified || []).some((d: any) => d.is_system || !d.store_id || d.store_id === store.id);
      if (!ok) {
        return NextResponse.json({
          error: `O domínio ${domain} não está verificado para esta loja. Adicione e verifique em E-mail & Domínios.`,
          code: 'domain_not_verified',
        }, { status: 400 });
      }
      // Saiu do domínio compartilhado: libera o nome para outras lojas.
      await releaseOtherLocalParts(store.id, null);
    }
    patch.default_sender_email = email;
  }

  // Merge into the existing settings JSONB so unrelated keys (e.g.
  // script_tag_id, loader_via) survive the update.
  const nextEmail: Record<string, any> = { ...prevEmail, ...patch };
  if (patch.tracking_domain === null) delete nextEmail.tracking_domain;
  const merged = { ...prevSettings, email_settings: nextEmail };

  const { data: updated, error: updErr } = await supabaseAdmin
    .from('shopify_stores')
    .update({ settings: merged, updated_at: new Date().toISOString() })
    .eq('id', store.id)
    .select('id, settings')
    .single();

  if (updErr) {
    return NextResponse.json({ error: updErr.message }, { status: 500 });
  }

  // Configuração mudou: o cache do remetente por loja precisa esquecer.
  try {
    const { __resetEmailProviderCache } = await import('@/lib/email/providers');
    __resetEmailProviderCache();
  } catch { /* melhor esforço */ }

  const finalSettings = (updated.settings as any)?.email_settings || {};
  return NextResponse.json({
    email_settings: finalSettings,
    shared_domain: sharedSenderDomain(),
    is_shared_domain: isSharedDomainEmail(finalSettings.default_sender_email),
  });
}
