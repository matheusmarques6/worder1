// =============================================
// Email provider abstraction
//
// One Worder org can pick which provider sends its automation /
// campaign emails. Today: Resend. Tomorrow: SMTP, SendGrid, Postmark,
// Amazon SES — they plug in by implementing this interface and
// registering in the factory.
// =============================================

export interface SendEmailParams {
  to: string;
  from: string;
  senderName?: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  // Per-message tags so the provider's webhook can correlate opens /
  // clicks back to our email_sends.id and campaign / flow ids.
  tags?: Array<{ name: string; value: string }>;
  // Provider-specific extras (header overrides, list-unsubscribe, etc.)
  headers?: Record<string, string>;
}

export interface SendEmailResult {
  /** Provider's message id (resend.id, smtp messageId, sendgrid x-message-id...) */
  id?: string;
  /** Raw provider response for debugging */
  raw?: any;
}

export interface EmailProvider {
  /** Stable identifier — also the value we store on organizations.email_provider */
  readonly id: string;
  /** Human label for the settings UI */
  readonly label: string;
  /**
   * Returns a list of env vars + DB fields that must be present for the
   * provider to send. Used by /api/diagnostics/automation-trace to flag
   * misconfigured deploys.
   */
  readonlyConfigCheck?(): Promise<{ ok: boolean; missing: string[] }>;
  /** Actually send. Throws on hard failures. */
  send(params: SendEmailParams): Promise<SendEmailResult>;
}

/**
 * Connection settings carried per-org. Stored as JSON on
 * organizations.email_provider_config so we don't need a column per
 * provider. Each provider reads what it needs.
 */
export interface EmailProviderConfig {
  /** Which provider is active */
  provider: 'resend' | 'smtp' | 'sendgrid' | 'postmark' | 'ses';
  /** Default from-address override (provider-agnostic) */
  defaultFrom?: string;
  defaultSenderName?: string;
  /** Store-level reply-to (shopify_stores.settings.email_settings.default_reply_to) */
  defaultReplyTo?: string;
  /** Provider-specific blob */
  resend?: { apiKey?: string };
  smtp?: {
    host: string;
    port: number;
    secure?: boolean;
    user: string;
    pass: string;
  };
  sendgrid?: { apiKey: string };
  postmark?: { serverToken: string };
  ses?: { region: string; accessKeyId: string; secretAccessKey: string };
}
