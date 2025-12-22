// =============================================
// WHATSAPP CLOUD API - CLIENTE COMPLETO
// src/lib/whatsapp/cloud-api.ts
// =============================================

const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

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
      throw new WhatsAppCloudError(data.error || { message: 'Request failed', code: response.status });
    }

    return data;
  }

  // =============================================
  // MENSAGENS DE TEXTO
  // =============================================

  async sendText(to: string, text: string, previewUrl = true): Promise<SendMessageResult> {
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

    const data = await this.request<{ data: Template[] }>(
      `/${id}/message_templates?limit=1000`
    );
    return data.data || [];
  }

  async getTemplate(templateId: string): Promise<Template> {
    return this.request(`/${templateId}`);
  }

  async createTemplate(
    wabaId: string,
    template: {
      name: string;
      language: string;
      category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
      components: any[];
    }
  ): Promise<{ id: string }> {
    return this.request(`/${wabaId}/message_templates`, {
      method: 'POST',
      body: JSON.stringify(template),
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

  // =============================================
  // MÍDIA
  // =============================================

  async uploadMedia(file: Buffer, mimeType: string, filename?: string): Promise<{ id: string }> {
    const formData = new FormData();
    formData.append('file', new Blob([file], { type: mimeType }), filename || 'file');
    formData.append('messaging_product', 'whatsapp');
    formData.append('type', mimeType);

    const response = await fetch(`${META_BASE_URL}/${this.config.phoneNumberId}/media`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
      body: formData,
    });

    return response.json();
  }

  async getMediaUrl(mediaId: string): Promise<{ url: string; mime_type: string; sha256: string; file_size: number }> {
    return this.request(`/${mediaId}`);
  }

  async downloadMedia(mediaId: string): Promise<{ data: Buffer; mimeType: string }> {
    const mediaInfo = await this.getMediaUrl(mediaId);
    
    const response = await fetch(mediaInfo.url, {
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
      },
    });

    const buffer = await response.arrayBuffer();
    return {
      data: Buffer.from(buffer),
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

  isWindowExpired(): boolean {
    return this.code === 131047;
  }

  isInvalidRecipient(): boolean {
    return this.code === 131026;
  }

  isTemplateNotApproved(): boolean {
    return this.code === 132012;
  }
}

// =============================================
// HELPERS
// =============================================

export function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

export function extractMessageText(message: WebhookMessage): string {
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

export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): boolean {
  const crypto = require('crypto');
  const expectedSignature = crypto
    .createHmac('sha256', appSecret)
    .update(payload)
    .digest('hex');
  
  return `sha256=${expectedSignature}` === signature;
}

// Factory
export function createWhatsAppCloudClient(config: WhatsAppCloudConfig): WhatsAppCloudAPI {
  return new WhatsAppCloudAPI(config);
}
