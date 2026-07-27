// =============================================
// WHATSAPP CLOUD API - CLIENTE COMPLETO
// src/lib/whatsapp/cloud-api.ts
// =============================================

// API Version centralizada em api-version.ts.
// Reexport mantém compatibilidade com consumidores existentes (Onda 2).
// Documentação: https://developers.facebook.com/docs/whatsapp/cloud-api
export { META_API_VERSION, META_BASE_URL } from './api-version';
import { META_BASE_URL } from './api-version';
import { withRetry } from './backoff';
import { wlog } from '@/lib/observability/whatsapp-logger';

// =============================================
// TIPOS
// =============================================

export interface WhatsAppCloudConfig {
  phoneNumberId: string;
  accessToken: string;
  wabaId?: string;
}

export interface SendMessageResult {
  messaging_product: string;
  contacts: Array<{ input: string; wa_id: string }>;
  messages: Array<{ id: string }>;
}

export interface MessageStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; message: string }>;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  status: string;
  category: string;
  components: any[];
}

export interface WebhookMessage {
  from: string;
  id: string;
  timestamp: string;
  type: string;
  text?: { body: string };
  image?: { id: string; mime_type: string; sha256: string; caption?: string };
  video?: { id: string; mime_type: string; sha256: string; caption?: string };
  audio?: { id: string; mime_type: string; sha256: string };
  document?: { id: string; filename: string; mime_type: string; sha256: string; caption?: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  contacts?: any[];
  interactive?: { type: string; button_reply?: { id: string; title: string }; list_reply?: { id: string; title: string } };
  button?: { text: string; payload: string };
  sticker?: { id: string; mime_type: string; sha256: string };
  reaction?: { message_id: string; emoji: string };
}

// =============================================
// CLASSE PRINCIPAL
// =============================================

export class WhatsAppCloudAPI {
  private config: WhatsAppCloudConfig;

  constructor(config: WhatsAppCloudConfig) {
    this.config = config;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = endpoint.startsWith('http')
      ? endpoint
      : `${META_BASE_URL}${endpoint}`;

    const doFetch = async (): Promise<T> => {
      const response = await fetch(url, {
        ...options,
        headers: {
          'Authorization': `Bearer ${this.config.accessToken}`,
          'Content-Type': 'application/json',
          ...options.headers,
        },
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        const err = new WhatsAppCloudError(
          data.error || { message: 'Request failed', code: response.status }
        );
        // status HTTP fica disponivel pro shouldRetry (5xx etc.)
        (err as any).status = response.status;
        // Meta envia Retry-After em segundos (ou data HTTP). Parsea e anexa
        // no error pra o getDelayOverride do withRetry usar.
        const retryAfterRaw = response.headers.get('Retry-After');
        if (retryAfterRaw) {
          const seconds = Number(retryAfterRaw);
          if (Number.isFinite(seconds) && seconds > 0) {
            (err as any).retryAfterMs = Math.round(seconds * 1000);
          } else {
            const ts = Date.parse(retryAfterRaw);
            if (Number.isFinite(ts)) {
              (err as any).retryAfterMs = Math.max(0, ts - Date.now());
            }
          }
        }
        throw err;
      }

      return data;
    };

    return withRetry<T>(doFetch, {
      maxRetries: 5,
      baseDelay: 1000,
      maxDelay: 30_000,
      jitter: 'decorrelated',
      shouldRetry: (err, attempt) => {
        if (err instanceof WhatsAppCloudError) {
          // Erros permanentes da Meta — nao retry
          if (err.isAuthError()) return false;
          if (err.code === 100) return false;
          // Rate limit / frequency cap — retry com backoff
          if (err.isRateLimited() || err.isFrequencyCapped() || err.isSpamRateLimited()) {
            return true;
          }
          // 5xx do servidor Meta
          if ((err as any).status >= 500 && (err as any).status < 600) return true;
          return false;
        }
        // Erros de rede (fetch failed etc.)
        return attempt < 5;
      },
      getDelayOverride: (err) => {
        const ms = (err as any)?.retryAfterMs;
        return typeof ms === 'number' && ms > 0 ? ms : undefined;
      },
      onRetry: (err, attempt, delay) => {
        wlog.warn('whatsapp.api.retry', {
          attempt,
          delay_ms: delay,
          code: (err as any)?.code,
          status: (err as any)?.status,
          retry_after_ms: (err as any)?.retryAfterMs,
        });
      },
    });
  }

  // =============================================
  // MENSAGENS DE TEXTO
  // =============================================

  async sendText(to: string, text: string, previewUrl = false): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'text',
        text: { preview_url: previewUrl, body: text },
      }),
    });
  }

  // =============================================
  // MENSAGENS DE MÍDIA
  // =============================================

  async sendImage(
    to: string,
    image: { link?: string; id?: string },
    caption?: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'image',
        image: { ...image, caption },
      }),
    });
  }

  async sendVideo(
    to: string,
    video: { link?: string; id?: string },
    caption?: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'video',
        video: { ...video, caption },
      }),
    });
  }

  async sendAudio(
    to: string,
    audio: { link?: string; id?: string }
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'audio',
        audio,
      }),
    });
  }

  async sendDocument(
    to: string,
    document: { link?: string; id?: string; filename?: string },
    caption?: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'document',
        document: { ...document, caption },
      }),
    });
  }

  async sendSticker(
    to: string,
    sticker: { link?: string; id?: string }
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'sticker',
        sticker,
      }),
    });
  }

  // =============================================
  // LOCALIZAÇÃO E CONTATOS
  // =============================================

  async sendLocation(
    to: string,
    location: { latitude: number; longitude: number; name?: string; address?: string }
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'location',
        location,
      }),
    });
  }

  async sendContacts(
    to: string,
    contacts: Array<{
      name: { formatted_name: string; first_name?: string; last_name?: string };
      phones?: Array<{ phone: string; type?: string }>;
      emails?: Array<{ email: string; type?: string }>;
    }>
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'contacts',
        contacts,
      }),
    });
  }

  // =============================================
  // TEMPLATES
  // =============================================

  async sendTemplate(
    to: string,
    templateName: string,
    languageCode: string = 'pt_BR',
    components?: any[]
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode },
          components: components || [],
        },
      }),
    });
  }

  async listTemplates(wabaId?: string): Promise<Template[]> {
    const id = wabaId || this.config.wabaId;
    if (!id) throw new Error('WABA ID required');

    interface TemplateListResponse {
      data: Template[];
      paging?: { cursors?: { after?: string }; next?: string };
    }

    const allTemplates: Template[] = [];
    let nextUrl: string | null = `/${id}/message_templates?limit=250`;
    let pages = 0;
    const maxPages = 20;

    while (nextUrl && pages < maxPages) {
      const page: TemplateListResponse = await this.request<TemplateListResponse>(nextUrl);
      allTemplates.push(...(page.data || []));
      nextUrl = page.paging?.next || null;
      pages++;
    }

    return allTemplates;
  }

  async getTemplate(templateId: string): Promise<Template> {
    return this.request(`/${templateId}`);
  }

  async getTemplateById(templateId: string): Promise<Template> {
    return this.request(`/${templateId}?fields=id,name,language,status,category,components`);
  }

  async createTemplate(
    wabaId: string,
    template: {
      name: string;
      language: string;
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      components: any[];
      allow_category_change?: boolean;
    }
  ): Promise<{ id: string }> {
    const payload = {
      ...template,
      allow_category_change: template.allow_category_change ?? true,
    };
    return this.request(`/${wabaId}/message_templates`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async deleteTemplate(wabaId: string, templateName: string): Promise<{ success: boolean }> {
    return this.request(`/${wabaId}/message_templates?name=${templateName}`, {
      method: 'DELETE',
    });
  }

  // =============================================
  // MENSAGENS INTERATIVAS
  // =============================================

  async sendButtons(
    to: string,
    body: string,
    buttons: Array<{ id: string; title: string }>,
    header?: { type: 'text'; text: string } | { type: 'image'; image: { link: string } },
    footer?: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'interactive',
        interactive: {
          type: 'button',
          header,
          body: { text: body },
          footer: footer ? { text: footer } : undefined,
          action: {
            buttons: buttons.slice(0, 3).map(b => ({
              type: 'reply',
              reply: { id: b.id, title: b.title.substring(0, 20) },
            })),
          },
        },
      }),
    });
  }

  async sendList(
    to: string,
    body: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ id: string; title: string; description?: string }>;
    }>,
    header?: string,
    footer?: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'interactive',
        interactive: {
          type: 'list',
          header: header ? { type: 'text', text: header } : undefined,
          body: { text: body },
          footer: footer ? { text: footer } : undefined,
          action: {
            button: buttonText.substring(0, 20),
            sections: sections.slice(0, 10).map(s => ({
              title: s.title.substring(0, 24),
              rows: s.rows.slice(0, 10).map(r => ({
                id: r.id,
                title: r.title.substring(0, 24),
                description: r.description?.substring(0, 72),
              })),
            })),
          },
        },
      }),
    });
  }

  // =============================================
  // REAÇÕES
  // =============================================

  async sendReaction(
    to: string,
    messageId: string,
    emoji: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: normalizePhone(to),
        type: 'reaction',
        reaction: { message_id: messageId, emoji },
      }),
    });
  }

  async removeReaction(to: string, messageId: string): Promise<SendMessageResult> {
    return this.sendReaction(to, messageId, '');
  }

  // =============================================
  // STATUS
  // =============================================

  async markAsRead(messageId: string): Promise<{ success: boolean }> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      }),
    });
  }

  /**
   * Mostra o indicador "digitando..." no chat do cliente.
   *
   * IMPORTANTE — limitação real da Cloud API: a Meta NÃO expõe um endpoint
   * de typing independente. O indicador só pode ser disparado JUNTO de um
   * "mark as read" e EXIGE o message_id de uma mensagem INBOUND recente
   * (a última recebida). Por isso este método precisa do inbound message_id.
   * O typing dura ~25s ou some quando a próxima mensagem é enviada.
   *
   * Se o inbound message_id não estiver disponível (ex.: simulador), o caller
   * deve pular o typing — não há como dispará-lo isoladamente.
   *
   * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/typing-indicators
   */
  async sendTyping(inboundMessageId: string): Promise<{ success: boolean }> {
    return this.request(`/${this.config.phoneNumberId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: inboundMessageId,
        typing_indicator: { type: 'text' },
      }),
    });
  }

  // =============================================
  // MÍDIA
  // =============================================

  async uploadMedia(fileData: ArrayBuffer, mimeType: string, filename?: string): Promise<{ id: string }> {
    // Meta's /media endpoint expects `type` to be the category
    // ("image" | "video" | "audio" | "document" | "sticker"), not the
    // full MIME string. Passing "image/jpeg" here returns code 100.
    const category = mimeType.startsWith('image/')
      ? 'image'
      : mimeType.startsWith('video/')
        ? 'video'
        : mimeType.startsWith('audio/')
          ? 'audio'
          : 'document';

    const formData = new FormData();
    formData.append('file', new Blob([fileData], { type: mimeType }), filename || 'file');
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', category);

    const response = await fetch(`${META_BASE_URL}/${this.config.phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    });

    const data = await response.json();
    if (!response.ok || data.error) {
      throw new WhatsAppCloudError(data.error || { message: 'Media upload failed', code: response.status });
    }
    return data;
  }

  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.request(`/${mediaId}`);
  }

  async downloadMedia(mediaId: string): Promise<{ data: Uint8Array; mimeType: string }> {
    const mediaInfo = await this.getMediaUrl(mediaId);
    
    const response = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    const buffer = await response.arrayBuffer();
    return {
      data: new Uint8Array(buffer),
      mimeType: mediaInfo.mime_type,
    };
  }

  // =============================================
  // PHONE NUMBERS
  // =============================================

  async getPhoneNumber(): Promise<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
  }> {
    return this.request(`/${this.config.phoneNumberId}?fields=display_phone_number,verified_name,quality_rating`);
  }

  async listPhoneNumbers(wabaId: string): Promise<Array<{
    id: string;
    display_phone_number: string;
    verified_name: string;
    quality_rating: string;
  }>> {
    const data = await this.request<{ data: any[] }>(
      `/${wabaId}/phone_numbers?fields=display_phone_number,verified_name,quality_rating`
    );
    return data.data || [];
  }

  // =============================================
  // BUSINESS PROFILE
  // =============================================

  async getBusinessProfile(): Promise<{
    about: string;
    address: string;
    description: string;
    email: string;
    profile_picture_url: string;
    websites: string[];
    vertical: string;
  }> {
    const data = await this.request<{ data: any[] }>(
      `/${this.config.phoneNumberId}/whatsapp_business_profile?fields=about,address,description,email,profile_picture_url,websites,vertical`
    );
    return data.data?.[0] || {};
  }

  async updateBusinessProfile(profile: {
    about?: string;
    address?: string;
    description?: string;
    email?: string;
    websites?: string[];
    vertical?: string;
  }): Promise<{ success: boolean }> {
    return this.request(`/${this.config.phoneNumberId}/whatsapp_business_profile`, {
      method: 'POST',
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        ...profile,
      }),
    });
  }

  async uploadFlowEncryptionKey(flowId: string, publicKey: string): Promise<{ success: boolean }> {
    return this.request(`/${flowId}/whatsapp_business_encryption`, {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKey }),
    });
  }

  async getFlowEncryptionKey(flowId: string): Promise<{ public_key: string }> {
    return this.request(`/${flowId}/whatsapp_business_encryption`);
  }
}

// =============================================
// ERRO CUSTOMIZADO
// =============================================

export class WhatsAppCloudError extends Error {
  code: number;
  type: string;
  fbtrace_id: string;
  error_subcode?: number;
  error_data?: any;

  constructor(error: any) {
    super(error.message || 'WhatsApp Cloud API Error');
    this.name = 'WhatsAppCloudError';
    this.code = error.code || 0;
    this.type = error.type || 'OAuthException';
    this.fbtrace_id = error.fbtrace_id || '';
    this.error_subcode = error.error_subcode;
    this.error_data = error.error_data;
  }

  isRateLimited(): boolean {
    return this.code === 4 || this.code === 80007;
  }

  isFrequencyCapped(): boolean {
    return this.code === 131049;
  }

  isSpamRateLimited(): boolean {
    return this.code === 131048;
  }

  isWindowExpired(): boolean {
    return this.code === 131047;
  }

  isInvalidRecipient(): boolean {
    return this.code === 131026;
  }

  isTemplateNotApproved(): boolean {
    return this.code === 132012;
  }

  isTemplatePaused(): boolean {
    return this.code === 132015;
  }

  isTemplateDisabled(): boolean {
    return this.code === 132016;
  }

  isAuthError(): boolean {
    return [190, 102, 200].includes(this.code);
  }
}

// =============================================
// HELPERS
// =============================================

// F.2 — i18n via libphonenumber-js. Mantém default 'BR' p/ preservar
// comportamento dos callers existentes; quem souber o país pode passar.
import { parsePhoneNumber, type CountryCode } from 'libphonenumber-js';

export function normalizePhone(phone: string, country: string = 'BR'): string {
  try {
    const parsed = parsePhoneNumber(phone, country as CountryCode);
    return parsed?.number?.replace('+', '') || phone.replace(/\D/g, '');
  } catch {
    return phone.replace(/\D/g, '');
  }
}

/**
 * Extrai texto do payload Meta webhook cru (não confundir com
 * `extractMessageText` em `message-content.ts`, que opera sobre o `content`
 * já armazenado no DB com formato aninhado diferente).
 */
export function extractWebhookMessageText(message: WebhookMessage): string {
  if (message.text) return message.text.body;
  if (message.image?.caption) return message.image.caption;
  if (message.video?.caption) return message.video.caption;
  if (message.document?.caption) return message.document.caption;
  if (message.interactive?.button_reply) return message.interactive.button_reply.title;
  if (message.interactive?.list_reply) return message.interactive.list_reply.title;
  if (message.button) return message.button.text;
  return '';
}

export function getMessageType(message: WebhookMessage): string {
  if (message.text) return 'text';
  if (message.image) return 'image';
  if (message.video) return 'video';
  if (message.audio) return 'audio';
  if (message.document) return 'document';
  if (message.location) return 'location';
  if (message.contacts) return 'contacts';
  if (message.sticker) return 'sticker';
  if (message.interactive) return 'interactive';
  if (message.button) return 'button';
  if (message.reaction) return 'reaction';
  return 'unknown';
}

/**
 * Verify Meta's X-Hub-Signature-256 header against the raw request body.
 *
 * - Uses node:crypto.timingSafeEqual on equal-length buffers to avoid
 *   timing side channels (Sprint 1 / Fase 2 hardening).
 * - Short-circuits on length mismatch BEFORE buffer compare (length itself
 *   doesn't leak via timing because hex output is fixed-width: sha256 = 64 hex).
 * - Accepts both 'sha256=<hex>' and bare '<hex>' inputs.
 *
 * IMPORTANT: pass the RAW request body, not the JSON-parsed-then-stringified
 * version. Meta signs the exact bytes — re-serializing breaks the HMAC.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string | null | undefined,
  appSecret: string
): Promise<boolean> {
  if (!signature || !appSecret) return false;

  // Node:crypto path (preferred — runs in API routes & workers)
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const nodeCrypto = require('crypto') as typeof import('crypto');
    const expected = nodeCrypto
      .createHmac('sha256', appSecret)
      .update(payload, 'utf8')
      .digest('hex');

    const received = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    if (expected.length !== received.length) return false;

    return nodeCrypto.timingSafeEqual(
      Buffer.from(expected, 'hex'),
      Buffer.from(received, 'hex')
    );
  } catch {
    // Web Crypto fallback (Edge runtime). Final compare is byte-by-byte
    // in constant time over the full hex string.
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuf = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const expected = Array.from(new Uint8Array(sigBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const received = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    if (expected.length !== received.length) return false;

    let diff = 0;
    for (let i = 0; i < expected.length; i++) {
      diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
    }
    return diff === 0;
  }
}

// Factory
export function createWhatsAppCloudClient(config: WhatsAppCloudConfig): WhatsAppCloudAPI {
  return new WhatsAppCloudAPI(config);
}

// =============================================
// EMBEDDED SIGNUP HELPERS
// =============================================
// Plan: Sprint 1 / Fase 3.
// Stateless calls — they don't need a per-WABA client. The token returned
// by exchangeEmbeddedSignupCode is what bootstraps everything else.

/**
 * Exchange the short-lived code returned by FB.login (Embedded Signup) for a
 * long-lived Business Integration System User token. The returned token does
 * not expire (per Meta docs for Tech Provider flow).
 *
 * @see https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider#step-1
 */
export async function exchangeEmbeddedSignupCode(params: {
  appId: string;
  appSecret: string;
  code: string;
}): Promise<{ access_token: string; token_type: string }> {
  const url = new URL(`${META_BASE_URL}/oauth/access_token`);
  url.searchParams.set('client_id', params.appId);
  url.searchParams.set('client_secret', params.appSecret);
  url.searchParams.set('code', params.code);

  const res = await fetch(url.toString(), { method: 'GET' });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new WhatsAppCloudError(data.error || { message: 'oauth code exchange failed', code: res.status });
  }
  return data;
}

/**
 * Webhook fields this app actually processes — must mirror the switch(field)
 * cases in webhook-processor.ts. Sent explicitly on subscribe so message
 * delivery does NOT depend on the app dashboard's webhook field config.
 */
export const WABA_SUBSCRIBED_FIELDS = [
  'messages',
  'message_template_status_update',
  'template_category_update',
  'phone_number_quality_update',
] as const;

/**
 * Subscribe your app to a WABA's webhook events. Must be called once per
 * WABA after Embedded Signup completes — without this, no inbound messages.
 * Sends subscribed_fields explicitly (audit: MEDIUM gap #1) instead of
 * relying on the Meta app dashboard webhook configuration.
 */
export async function subscribeAppToWABA(params: {
  wabaId: string;
  accessToken: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${META_BASE_URL}/${params.wabaId}/subscribed_apps`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ subscribed_fields: WABA_SUBSCRIBED_FIELDS }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new WhatsAppCloudError(data.error || { message: 'subscribe failed', code: res.status });
  }
  return data;
}

/**
 * Register a phone number with Meta after Embedded Signup. PIN is required
 * by Meta API; for accounts without 2FA the value is arbitrary but must be
 * 6 digits.
 *
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/reference/registration#register
 */
export async function registerPhoneNumber(params: {
  phoneNumberId: string;
  accessToken: string;
  pin: string;
}): Promise<{ success: boolean }> {
  const res = await fetch(`${META_BASE_URL}/${params.phoneNumberId}/register`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      pin: params.pin,
    }),
  });
  const data = await res.json();
  if (!res.ok || data.error) {
    throw new WhatsAppCloudError(data.error || { message: 'register failed', code: res.status });
  }
  return data;
}
