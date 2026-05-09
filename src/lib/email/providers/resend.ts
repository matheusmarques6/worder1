import type { EmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './types';

/**
 * Resend implementation. API key resolution order:
 *   1. orgConfig.resend.apiKey (per-org override)
 *   2. process.env.RESEND_API_KEY (global)
 */
export function createResendProvider(orgConfig?: EmailProviderConfig): EmailProvider {
  const apiKey = orgConfig?.resend?.apiKey || process.env.RESEND_API_KEY;

  return {
    id: 'resend',
    label: 'Resend',

    async send(params: SendEmailParams): Promise<SendEmailResult> {
      if (!apiKey) {
        throw new Error('Resend API key missing (set RESEND_API_KEY or organizations.email_provider_config.resend.apiKey)');
      }
      // Lazy import keeps the resend npm package out of the initial
      // bundle when other providers are configured.
      const { Resend } = await import('resend');
      const client = new Resend(apiKey);
      const fromAddress = params.senderName
        ? `${params.senderName} <${params.from}>`
        : params.from;
      const { data, error } = await client.emails.send({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
        headers: params.headers,
        tags: params.tags,
      } as any);
      if (error) throw new Error(`Resend: ${(error as any).message || JSON.stringify(error)}`);
      return { id: data?.id, raw: data };
    },
  };
}
