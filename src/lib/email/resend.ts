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
  const apiKey = process.env.RESEND_API_KEY;
  // Chamar REST diretamente (SDK pode ter incompatibilidades de versão)
  const res = await fetch(`https://api.resend.com/domains/${domainId}/verify`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    console.error('[Resend] Verify domain error:', json);
    throw new Error(json?.message || `Verify failed: ${res.status}`);
  }
  return await res.json().catch(() => ({}));
}

/**
 * Liga/desliga o click/open tracking DA RESEND para um domínio.
 * O tracking primário é o da Worder (/api/t/*): carrega worderContactID/
 * SendID/CampaignID + UTMs (atribuição de vendas), detecta Apple MPP e
 * sobrevive a uma troca de provedor. Com o da Resend ligado junto, cada
 * link vira redirect duplo (click.<dominio> → worder → loja) e cada
 * abertura conta duas vezes — então domínios gerenciados pela Worder
 * ficam com o tracking da Resend desligado.
 */
export async function setDomainTracking(
  domainId: string,
  opts: { clickTracking: boolean; openTracking: boolean }
) {
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      click_tracking: opts.clickTracking,
      open_tracking: opts.openTracking,
    }),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json?.message || `Domain tracking update failed: ${res.status}`);
  }
  return await res.json().catch(() => ({}));
}

export async function getDomain(domainId: string) {
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch(`https://api.resend.com/domains/${domainId}`, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    console.error('[Resend] Get domain error:', json);
    throw new Error(json?.message || `Get domain failed: ${res.status}`);
  }
  return await res.json();
}

/**
 * Lista todos os domínios da conta Resend.
 */
export async function listDomains() {
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch('https://api.resend.com/domains', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  if (!res.ok) throw new Error(`List domains failed: ${res.status}`);
  return await res.json();
}

// =============================================
// Webhooks
// =============================================

export async function registerWebhook(endpointUrl: string) {
  const resend = getResend();

  // Resend SDK v6+ usa 'endpoint' (não 'url')
  const payload: any = {
    endpoint: endpointUrl,
    events: [
      'email.sent',
      'email.delivered',
      'email.delivery_delayed',
      'email.bounced',
      'email.complained',
      // Rejeição pré-envio (suppression list, domínio não verificado).
      // O handler trata email.failed como supressão dura — sem assinar
      // o evento aqui ele nunca chegava.
      'email.failed',
      'email.opened',
      'email.clicked',
    ],
  };

  // Tenta via SDK
  const client: any = resend as any;
  if (client.webhooks?.create) {
    const { data, error } = await client.webhooks.create(payload);
    if (error) {
      console.error('[Resend] SDK webhook error:', error);
      throw new Error(`Resend webhook error: ${error.message}`);
    }
    return data;
  }

  // Fallback: chamada direta REST
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch('https://api.resend.com/webhooks', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || json?.error?.message || 'Webhook registration failed');
  return json;
}

export async function listWebhooks() {
  const resend = getResend();
  const client: any = resend as any;
  if (client.webhooks?.list) {
    const { data, error } = await client.webhooks.list();
    if (error) throw new Error(`Resend webhook error: ${error.message}`);
    return data;
  }
  // Fallback REST
  const apiKey = process.env.RESEND_API_KEY;
  const res = await fetch('https://api.resend.com/webhooks', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.message || 'Failed to list webhooks');
  return json;
}

// =============================================
// Batch send
// =============================================

export interface BatchEmail {
  from: string;
  to: string[];
  subject: string;
  html: string;
  /** Optional plain-text alternative. Resend ships it as the
   *  text/plain half of a multipart/alternative MIME — required for
   *  the founder-style "text" editor flavor. */
  text?: string;
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
