// =============================================
// Provider factory: pick the right implementation per org / store.
//
// Identidade do remetente (from / nome / reply-to) — a regra, em UM lugar:
//
//   1. Loja com email_settings próprio → é ela. Sempre.
//   2. Loja sem remetente configurado:
//        organização com UMA loja → o padrão da organização (é a mesma
//        loja, guardado no lugar antigo);
//        organização com VÁRIAS lojas → identidade neutra da plataforma
//        (RESEND_FROM_EMAIL) com o NOME da loja e reply-to no e-mail da
//        loja. Nunca o remetente de outra loja.
//   3. Sem loja (envio da organização inteira) → padrão da organização.
//
// O defeito que motivou isto: a leitura da loja pedia a coluna `name`,
// que não existe (é shop_name). O PostgREST devolvia erro, a loja vinha
// nula e TODO envio de loja — inclusive de lojas com remetente
// configurado — saía com a identidade da organização. Uma loja nova
// (Medicube) mandou e-mail de teste como "Based <based@worder.email>".
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EmailProvider, EmailProviderConfig } from './types';
import { createResendProvider } from './resend';
import { createSmtpProvider } from './smtp';

// Cache key includes storeId so a multi-store org doesn't get the
// wrong sender identity from a cached row.
const cache = new Map<string, { provider: EmailProvider; config: EmailProviderConfig; ts: number }>();
const CACHE_TTL_MS = 60_000;

/** Para os testes e para quem muda configuração e quer ver o efeito já. */
export function __resetEmailProviderCache() { cache.clear(); }

/** Remetente neutro da plataforma — nunca é a identidade de uma loja. */
export function platformFallbackFrom(): string {
  return process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
}

/** Domínio sintético de loja ainda sem integração — não conta como loja. */
function isPlaceholderDomain(shopDomain: unknown): boolean {
  return typeof shopDomain === 'string' && shopDomain.endsWith('.worder.local');
}

async function countRealActiveStores(organizationId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('shopify_stores')
    .select('id, shop_domain')
    .eq('organization_id', organizationId)
    .eq('is_active', true);
  return ((data || []) as any[]).filter((s) => !isPlaceholderDomain(s.shop_domain)).length;
}

export type SenderSource = 'store' | 'org' | 'platform';

/**
 * Resolve the email provider for a send. When storeId is provided,
 * sender identity (from / sender name / reply-to) is sourced from
 * shopify_stores.settings.email_settings — that's the per-store config
 * the Settings → Email page writes. The transport (Resend / SMTP /
 * future Postmark) still comes from the org row because providers
 * scale per merchant, not per storefront.
 *
 * Defaults to Resend when no per-org config is set.
 */
export async function getEmailProviderForOrg(
  organizationId: string,
  storeId?: string | null
): Promise<{ provider: EmailProvider; config: EmailProviderConfig }> {
  const cacheKey = `${organizationId}::${storeId || ''}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { provider: cached.provider, config: cached.config };
  }

  const { data } = await supabaseAdmin
    .from('organizations')
    .select('email_provider, email_provider_config, email_settings')
    .eq('id', organizationId)
    .maybeSingle();

  const config: EmailProviderConfig = (data?.email_provider_config as any) || {
    provider: (data?.email_provider as any) || 'resend',
  };
  // Older schemas stored only email_provider; sync into the config blob.
  if (data?.email_provider && !config.provider) {
    config.provider = data.email_provider as any;
  }

  const orgEmailSettings: any = data?.email_settings || {};
  const orgDefaults = {
    senderName: (orgEmailSettings.default_sender_name as string | undefined) || undefined,
    from: (orgEmailSettings.default_sender_email as string | undefined) || undefined,
    replyTo: (orgEmailSettings.default_reply_to as string | undefined) || undefined,
  };

  // A identidade que o provider_config já carregava (SMTP com from fixo,
  // por exemplo) só serve para envios SEM loja. Com loja, é recalculada
  // abaixo — nenhum padrão da organização pode ficar por baixo.
  const configuredFrom = config.defaultFrom;
  const configuredSenderName = config.defaultSenderName;
  const configuredReplyTo = config.defaultReplyTo;

  let source: SenderSource = 'org';

  if (storeId) {
    const { data: store, error: storeErr } = await supabaseAdmin
      .from('shopify_stores')
      // A coluna é shop_name — pedir `name` derrubava a consulta inteira
      // e a loja "não existia" para o remetente.
      .select('id, shop_name, shop_email, settings')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (storeErr) console.error('[email-providers] falha ao ler a loja para o remetente:', storeErr);

    const storeEmailSettings: any = (store?.settings as any)?.email_settings || {};
    const storeName: string | undefined = storeEmailSettings.default_sender_name || store?.shop_name || undefined;
    const storeFrom: string | undefined = storeEmailSettings.default_sender_email || undefined;
    const storeReplyTo: string | undefined = storeEmailSettings.default_reply_to || store?.shop_email || undefined;

    if (storeFrom) {
      // 1. A loja tem remetente próprio.
      source = 'store';
      config.defaultFrom = storeFrom;
      config.defaultSenderName = storeName;
      config.defaultReplyTo = storeReplyTo;
    } else {
      // 2. Sem remetente na loja. O padrão da organização só vale quando
      // ela tem UMA loja — aí é a mesma coisa. Com várias, o padrão da
      // organização é a identidade de OUTRA loja: fica a neutra.
      const stores = store ? await countRealActiveStores(organizationId) : 0;
      const orgFrom = configuredFrom || orgDefaults.from;
      if (store && stores <= 1 && orgFrom) {
        source = 'org';
        config.defaultFrom = orgFrom;
        config.defaultSenderName = storeName || configuredSenderName || orgDefaults.senderName;
        config.defaultReplyTo = configuredReplyTo || orgDefaults.replyTo || storeReplyTo;
      } else {
        source = 'platform';
        config.defaultFrom = platformFallbackFrom();
        config.defaultSenderName = storeName || 'Worder';
        config.defaultReplyTo = storeReplyTo;
        if (store) {
          console.warn(`[email-providers] loja ${storeId} sem remetente configurado — usando remetente neutro da plataforma com o nome "${config.defaultSenderName}"`);
        }
      }
    }
  } else {
    // 3. Sem loja: padrão da organização (o comportamento de sempre).
    if (!config.defaultSenderName && orgDefaults.senderName) config.defaultSenderName = orgDefaults.senderName;
    if (!config.defaultFrom && orgDefaults.from) config.defaultFrom = orgDefaults.from;
    if (!config.defaultReplyTo && orgDefaults.replyTo) config.defaultReplyTo = orgDefaults.replyTo;
  }
  (config as any).senderSource = source;

  let provider: EmailProvider;
  switch (config.provider) {
    case 'smtp':
      provider = createSmtpProvider(config);
      break;
    // sendgrid/postmark/ses can land here when their files are added —
    // the factory is the only place that needs to know about them.
    case 'resend':
    default:
      provider = createResendProvider(config);
      break;
  }

  cache.set(cacheKey, { provider, config, ts: Date.now() });
  return { provider, config };
}

export type { EmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './types';
