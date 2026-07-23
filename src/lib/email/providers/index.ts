// =============================================
// Provider factory: pick the right implementation per org / store.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EmailProvider, EmailProviderConfig } from './types';
import { createResendProvider } from './resend';
import { createSmtpProvider } from './smtp';

// Cache key includes storeId so a multi-store org doesn't get the
// wrong sender identity from a cached row.
const cache = new Map<string, { provider: EmailProvider; config: EmailProviderConfig; ts: number }>();
const CACHE_TTL_MS = 60_000;

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

  // Sender identity defaults — org-level. Overridden below by store-level
  // settings when a storeId is supplied.
  const orgEmailSettings: any = data?.email_settings || {};
  if (orgEmailSettings.default_sender_name && !config.defaultSenderName) {
    config.defaultSenderName = orgEmailSettings.default_sender_name;
  }
  if (orgEmailSettings.default_sender_email && !config.defaultFrom) {
    config.defaultFrom = orgEmailSettings.default_sender_email;
  }

  if (storeId) {
    const { data: store } = await supabaseAdmin
      .from('shopify_stores')
      .select('name, settings')
      .eq('id', storeId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    const storeEmailSettings: any = (store?.settings as any)?.email_settings || null;
    // Sender NAME for a store-scoped send is the store's identity, never
    // the org's. Precedence: explicit per-store setting → the store's own
    // name. Without this a multi-store org sends EVERY store's mail under
    // the org name (e.g. Dr. Groot's emails arriving as "Based"), because
    // the org-level default above was left in place for stores with no
    // explicit email_settings.default_sender_name.
    if (storeEmailSettings?.default_sender_name) {
      config.defaultSenderName = storeEmailSettings.default_sender_name;
    } else if (store?.name) {
      config.defaultSenderName = store.name;
    }
    if (storeEmailSettings) {
      if (storeEmailSettings.default_sender_email) {
        config.defaultFrom = storeEmailSettings.default_sender_email;
      }
      if (storeEmailSettings.default_reply_to) {
        config.defaultReplyTo = storeEmailSettings.default_reply_to;
      }
    }
  }

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
