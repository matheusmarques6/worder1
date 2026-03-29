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
