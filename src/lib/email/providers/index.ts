// =============================================
// Provider factory: pick the right implementation per org.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';
import type { EmailProvider, EmailProviderConfig } from './types';
import { createResendProvider } from './resend';
import { createSmtpProvider } from './smtp';

const cache = new Map<string, { provider: EmailProvider; config: EmailProviderConfig; ts: number }>();
const CACHE_TTL_MS = 60_000;

/**
 * Resolve the email provider for an organization. Defaults to Resend
 * (legacy behavior) when no per-org config is set.
 */
export async function getEmailProviderForOrg(organizationId: string): Promise<{ provider: EmailProvider; config: EmailProviderConfig }> {
  const cached = cache.get(organizationId);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { provider: cached.provider, config: cached.config };
  }

  const { data } = await supabaseAdmin
    .from('organizations')
    .select('email_provider, email_provider_config')
    .eq('id', organizationId)
    .maybeSingle();

  const config: EmailProviderConfig = (data?.email_provider_config as any) || {
    provider: (data?.email_provider as any) || 'resend',
  };
  // Older schemas stored only email_provider; sync into the config blob.
  if (data?.email_provider && !config.provider) {
    config.provider = data.email_provider as any;
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

  cache.set(organizationId, { provider, config, ts: Date.now() });
  return { provider, config };
}

export type { EmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './types';
