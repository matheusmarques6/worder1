// =============================================
// WORDER: Resend SDK Wrapper
// /src/lib/email/resend.ts
//
// Singleton lazy-initialized Resend client.
// =============================================

import { Resend } from 'resend';

let resendInstance: Resend | null = null;

function getResend(): Resend {
  if (resendInstance) return resendInstance;

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY environment variable is not set');
  }

  resendInstance = new Resend(apiKey);
  return resendInstance;
}

export interface SendEmailOptions {
  to: string | string[];
  from: string;
  senderName?: string;
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
}

export async function sendEmail({
  to,
  from,
  senderName,
  subject,
  html,
  replyTo,
  tags,
}: SendEmailOptions) {
  const resend = getResend();

  const fromAddress = senderName ? `${senderName} <${from}>` : from;

  const { data, error } = await resend.emails.send({
    to: Array.isArray(to) ? to : [to],
    from: fromAddress,
    subject,
    html,
    replyTo,
    tags,
  });

  if (error) {
    console.error('[Resend] Error sending email:', error);
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

export async function createDomain(domain: string) {
  const resend = getResend();

  const { data, error } = await resend.domains.create({ name: domain });

  if (error) {
    console.error('[Resend] Error creating domain:', error);
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

export async function verifyDomain(domainId: string) {
  const resend = getResend();

  const { data, error } = await resend.domains.verify(domainId);

  if (error) {
    console.error('[Resend] Error verifying domain:', error);
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

export async function getDomain(domainId: string) {
  const resend = getResend();

  const { data, error } = await resend.domains.get(domainId);

  if (error) {
    console.error('[Resend] Error getting domain:', error);
    throw new Error(`Resend error: ${error.message}`);
  }

  return data;
}

// =============================================
// Webhooks
// =============================================

export async function registerWebhook(endpointUrl: string) {
  const resend = getResend();
  const client: any = resend as any;
  const { data, error } = await client.webhooks.create({
    url: endpointUrl,
    events: [
      'email.sent',
      'email.delivered',
      'email.delivery_delayed',
      'email.bounced',
      'email.complained',
      'email.opened',
      'email.clicked',
    ],
  });
  if (error) {
    console.error('[Resend] Error registering webhook:', error);
    throw new Error(`Resend webhook error: ${error.message}`);
  }
  return data;
}

export async function listWebhooks() {
  const resend = getResend();
  const client: any = resend as any;
  const { data, error } = await client.webhooks.list();
  if (error) {
    console.error('[Resend] Error listing webhooks:', error);
    throw new Error(`Resend webhook error: ${error.message}`);
  }
  return data;
}

// =============================================
// Batch send
// =============================================

export interface BatchEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
  tags?: { name: string; value: string }[];
  headers?: Record<string, string>;
}

export async function sendBatchEmails(emails: BatchEmail[]) {
  const resend = getResend();
  const { data, error } = await resend.batch.send(emails as any);
  if (error) {
    console.error('[Resend] Error sending batch:', error);
    throw new Error(`Resend batch error: ${error.message}`);
  }
  return data;
}
