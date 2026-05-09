import type { EmailProvider, SendEmailParams, SendEmailResult, EmailProviderConfig } from './types';

/**
 * Generic SMTP provider via nodemailer. Plays well with any host that
 * speaks SMTP — Mailgun, Mailtrap, your own postfix, custom Brazilian
 * providers, etc.
 *
 * Config (orgConfig.smtp): host, port, secure, user, pass.
 */
export function createSmtpProvider(orgConfig?: EmailProviderConfig): EmailProvider {
  return {
    id: 'smtp',
    label: 'SMTP',

    async send(params: SendEmailParams): Promise<SendEmailResult> {
      const cfg = orgConfig?.smtp;
      if (!cfg?.host || !cfg.user || !cfg.pass) {
        throw new Error('SMTP not configured (need host, user, pass on organizations.email_provider_config.smtp)');
      }
      const nodemailer = await import('nodemailer');
      const transport = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port || 587,
        secure: cfg.secure ?? (cfg.port === 465),
        auth: { user: cfg.user, pass: cfg.pass },
      });
      const fromAddress = params.senderName
        ? `${params.senderName} <${params.from}>`
        : params.from;
      const info = await transport.sendMail({
        from: fromAddress,
        to: params.to,
        subject: params.subject,
        html: params.html,
        text: params.text,
        replyTo: params.replyTo,
        headers: params.headers,
      });
      return { id: info.messageId, raw: info };
    },
  };
}
