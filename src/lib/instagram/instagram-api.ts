// =============================================
// INSTAGRAM MESSAGING API - CLIENTE COMPLETO
// src/lib/instagram/instagram-api.ts
//
// Documentacao: https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/messaging
// Versao da API: v21.0 (Marco 2026)
// =============================================

// API Version atualizada para v21.0 (Marco 2026)
const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// =============================================
// TIPOS
// =============================================

export interface InstagramConfig {
  igUserId: string;           // Instagram Business Account ID
  accessToken: string;        // Long-lived access token
  pageId?: string;            // Facebook Page ID (para algumas operacoes)
}

export interface SendMessageResult {
  recipient_id: string;
  message_id: string;
}

export interface InstagramMessage {
  id: string;
  created_time: string;
  from: {
    id: string;
    username?: string;
  };
  to: {
    data: Array<{ id: string }>;
  };
  message?: string;
  attachments?: {
    data: Array<{
      id: string;
      type: 'image' | 'video' | 'audio' | 'file' | 'share';
      url?: string;
    }>;
  };
  shares?: {
    data: Array<{
      link: string;
    }>;
  };
  story?: {
    mention?: {
      link: string;
      id: string;
    };
    reply_to?: {
      link: string;
      id: string;
    };
  };
  reactions?: {
    data: Array<{
      emoji: string;
      from: { id: string };
    }>;
  };
  is_unsupported?: boolean;
  is_deleted?: boolean;
}

export interface InstagramConversation {
  id: string;
  updated_time: string;
  participants: {
    data: Array<{
      id: string;
      username?: string;
    }>;
  };
  messages?: {
    data: InstagramMessage[];
    paging?: {
      cursors: {
        before: string;
        after: string;
      };
    };
  };
}

export interface InstagramProfile {
  id: string;
  username: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  follows_count?: number;
  media_count?: number;
}

export interface WebhookEntry {
  time: number;
  id: string;
  messaging?: Array<{
    sender: { id: string };
    recipient: { id: string };
    timestamp: number;
    message?: {
      mid: string;
      text?: string;
      is_echo?: boolean;
      is_deleted?: boolean;
      is_unsupported?: boolean;
      attachments?: Array<{
        type: 'image' | 'video' | 'audio' | 'file' | 'ig_reel' | 'story_mention';
        payload?: {
          url?: string;
          reel_video_id?: string;
          story_id?: string;
        };
      }>;
      quick_reply?: {
        payload: string;
      };
    };
    postback?: {
      mid: string;
      title: string;
      payload: string;
    };
    reaction?: {
      mid: string;
      action: 'react' | 'unreact';
      reaction?: string;
      emoji?: string;
    };
    read?: {
      mid: string;
      watermark: number;
    };
    referral?: {
      ref: string;
      source: string;
      type: string;
    };
  }>;
  changes?: Array<{
    field: string;
    value: any;
  }>;
}

// =============================================
// CLASSE PRINCIPAL
// =============================================

export class InstagramMessagingAPI {
  private config: InstagramConfig;

  constructor(config: InstagramConfig) {
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
      throw new InstagramAPIError(data.error || { message: 'Request failed', code: response.status });
    }

    return data;
  }

  // =============================================
  // MENSAGENS
  // =============================================

  /**
   * Envia mensagem de texto via Instagram Direct
   */
  async sendText(recipientId: string, text: string): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });
  }

  /**
   * Envia imagem via Instagram Direct
   */
  async sendImage(
    recipientId: string,
    imageUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: imageUrl },
          },
        },
      }),
    });
  }

  /**
   * Envia video via Instagram Direct
   */
  async sendVideo(
    recipientId: string,
    videoUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl },
          },
        },
      }),
    });
  }

  /**
   * Envia audio via Instagram Direct
   */
  async sendAudio(
    recipientId: string,
    audioUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'audio',
            payload: { url: audioUrl },
          },
        },
      }),
    });
  }

  /**
   * Envia arquivo generico via Instagram Direct
   */
  async sendFile(
    recipientId: string,
    fileUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'file',
            payload: { url: fileUrl },
          },
        },
      }),
    });
  }

  /**
   * Envia template generico (Generic Template)
   */
  async sendGenericTemplate(
    recipientId: string,
    elements: Array<{
      title: string;
      subtitle?: string;
      image_url?: string;
      buttons?: Array<{
        type: 'web_url' | 'postback';
        title: string;
        url?: string;
        payload?: string;
      }>;
    }>
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: elements.slice(0, 10), // Max 10 elementos
            },
          },
        },
      }),
    });
  }

  /**
   * Envia produto (Product Template)
   */
  async sendProduct(
    recipientId: string,
    productId: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'product',
              product_id: productId,
            },
          },
        },
      }),
    });
  }

  /**
   * Envia quick replies
   */
  async sendQuickReplies(
    recipientId: string,
    text: string,
    quickReplies: Array<{
      content_type: 'text';
      title: string;
      payload: string;
      image_url?: string;
    }>
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          text,
          quick_replies: quickReplies.slice(0, 13), // Max 13 quick replies
        },
      }),
    });
  }

  /**
   * Envia Ice Breakers (mensagens sugeridas)
   */
  async setIceBreakers(
    iceBreakers: Array<{
      question: string;
      payload: string;
    }>
  ): Promise<{ success: boolean }> {
    return this.request(`/${this.config.igUserId}/ice_breakers`, {
      method: 'POST',
      body: JSON.stringify({
        ice_breakers: iceBreakers.slice(0, 4), // Max 4 ice breakers
      }),
    });
  }

  /**
   * Deleta Ice Breakers
   */
  async deleteIceBreakers(): Promise<{ success: boolean }> {
    return this.request(`/${this.config.igUserId}/ice_breakers`, {
      method: 'DELETE',
    });
  }

  /**
   * Envia reacao a uma mensagem
   */
  async sendReaction(
    recipientId: string,
    messageId: string,
    reaction: 'love' | 'haha' | 'wow' | 'sad' | 'angry' | 'like'
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'react',
        payload: {
          message_id: messageId,
          reaction,
        },
      }),
    });
  }

  /**
   * Remove reacao de uma mensagem
   */
  async removeReaction(
    recipientId: string,
    messageId: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'unreact',
        payload: {
          message_id: messageId,
        },
      }),
    });
  }

  // =============================================
  // CONVERSAS
  // =============================================

  /**
   * Lista conversas do Instagram
   */
  async listConversations(
    options: {
      limit?: number;
      after?: string;
      fields?: string[];
    } = {}
  ): Promise<{
    data: InstagramConversation[];
    paging?: { cursors: { before: string; after: string } };
  }> {
    const params = new URLSearchParams();
    params.set('platform', 'instagram');

    if (options.limit) params.set('limit', options.limit.toString());
    if (options.after) params.set('after', options.after);

    const fields = options.fields || ['participants', 'updated_time', 'messages{id,created_time,from,to,message,attachments}'];
    params.set('fields', fields.join(','));

    return this.request(`/${this.config.igUserId}/conversations?${params}`);
  }

  /**
   * Busca uma conversa especifica
   */
  async getConversation(
    conversationId: string,
    messageLimit: number = 50
  ): Promise<InstagramConversation> {
    return this.request(
      `/${conversationId}?fields=participants,updated_time,messages.limit(${messageLimit}){id,created_time,from,to,message,attachments,is_unsupported,is_deleted}`
    );
  }

  /**
   * Busca mensagens de uma conversa
   */
  async getMessages(
    conversationId: string,
    options: {
      limit?: number;
      after?: string;
    } = {}
  ): Promise<{
    data: InstagramMessage[];
    paging?: { cursors: { before: string; after: string } };
  }> {
    const params = new URLSearchParams();
    params.set('fields', 'id,created_time,from,to,message,attachments,is_unsupported,is_deleted');

    if (options.limit) params.set('limit', options.limit.toString());
    if (options.after) params.set('after', options.after);

    return this.request(`/${conversationId}/messages?${params}`);
  }

  // =============================================
  // PERFIL
  // =============================================

  /**
   * Busca perfil do usuario
   */
  async getUserProfile(userId: string): Promise<InstagramProfile> {
    return this.request(
      `/${userId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count`
    );
  }

  /**
   * Busca perfil da conta conectada
   */
  async getMyProfile(): Promise<InstagramProfile> {
    return this.getUserProfile(this.config.igUserId);
  }

  // =============================================
  // MIDIA
  // =============================================

  /**
   * Faz upload de media para o Instagram
   * Retorna o ID da media que pode ser usado para enviar mensagens
   */
  async uploadMedia(
    mediaUrl: string,
    mediaType: 'IMAGE' | 'VIDEO'
  ): Promise<{ id: string }> {
    return this.request(`/${this.config.igUserId}/media`, {
      method: 'POST',
      body: JSON.stringify({
        [mediaType.toLowerCase() + '_url']: mediaUrl,
        media_type: mediaType,
      }),
    });
  }

  // =============================================
  // CONFIGURACOES DO MESSENGER
  // =============================================

  /**
   * Configura mensagem de boas-vindas
   */
  async setWelcomeMessage(text: string): Promise<{ result: string }> {
    return this.request(`/${this.config.igUserId}/messenger_profile`, {
      method: 'POST',
      body: JSON.stringify({
        greeting: [
          {
            locale: 'default',
            text,
          },
        ],
      }),
    });
  }

  /**
   * Remove mensagem de boas-vindas
   */
  async deleteWelcomeMessage(): Promise<{ result: string }> {
    return this.request(`/${this.config.igUserId}/messenger_profile?fields=greeting`, {
      method: 'DELETE',
    });
  }

  /**
   * Configura menu persistente
   */
  async setPersistentMenu(
    buttons: Array<{
      type: 'web_url' | 'postback';
      title: string;
      url?: string;
      payload?: string;
    }>
  ): Promise<{ result: string }> {
    return this.request(`/${this.config.igUserId}/messenger_profile`, {
      method: 'POST',
      body: JSON.stringify({
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: buttons.slice(0, 5), // Max 5 botoes
          },
        ],
      }),
    });
  }

  /**
   * Remove menu persistente
   */
  async deletePersistentMenu(): Promise<{ result: string }> {
    return this.request(`/${this.config.igUserId}/messenger_profile?fields=persistent_menu`, {
      method: 'DELETE',
    });
  }

  // =============================================
  // ACOES DO REMETENTE
  // =============================================

  /**
   * Marca conversa como visualizada
   */
  async markSeen(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'mark_seen',
      }),
    });
  }

  /**
   * Mostra indicador de digitacao
   */
  async typingOn(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'typing_on',
      }),
    });
  }

  /**
   * Remove indicador de digitacao
   */
  async typingOff(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.igUserId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'typing_off',
      }),
    });
  }
}

// =============================================
// ERRO CUSTOMIZADO
// =============================================

export class InstagramAPIError extends Error {
  code: number;
  type: string;
  fbtrace_id: string;
  error_subcode?: number;
  error_user_msg?: string;

  constructor(error: any) {
    super(error.message || 'Instagram API Error');
    this.name = 'InstagramAPIError';
    this.code = error.code || 0;
    this.type = error.type || 'OAuthException';
    this.fbtrace_id = error.fbtrace_id || '';
    this.error_subcode = error.error_subcode;
    this.error_user_msg = error.error_user_msg;
  }

  isRateLimited(): boolean {
    return this.code === 4 || this.code === 17;
  }

  isPermissionError(): boolean {
    return this.code === 10 || this.code === 200;
  }

  isTokenExpired(): boolean {
    return this.code === 190;
  }

  isMessageWindowClosed(): boolean {
    // Instagram tem janela de 7 dias para responder
    return this.error_subcode === 2534015;
  }
}

// =============================================
// HELPERS
// =============================================

/**
 * Verifica assinatura do webhook
 */
export async function verifyInstagramWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(appSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  );

  const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  return `sha256=${expectedSignature}` === signature;
}

/**
 * Extrai texto de uma mensagem do webhook
 */
export function extractInstagramMessageText(entry: WebhookEntry): string | null {
  const messaging = entry.messaging?.[0];
  if (!messaging) return null;

  if (messaging.message?.text) {
    return messaging.message.text;
  }

  if (messaging.postback?.title) {
    return messaging.postback.title;
  }

  if (messaging.message?.quick_reply?.payload) {
    return messaging.message.quick_reply.payload;
  }

  return null;
}

/**
 * Verifica se mensagem e echo (enviada por nos mesmos)
 */
export function isEchoMessage(entry: WebhookEntry): boolean {
  return entry.messaging?.[0]?.message?.is_echo === true;
}

/**
 * Verifica tipo de mensagem do webhook
 */
export function getInstagramWebhookMessageType(entry: WebhookEntry):
  'text' | 'image' | 'video' | 'audio' | 'file' | 'reel' | 'story_mention' | 'postback' | 'reaction' | 'read' | 'unknown' {
  const messaging = entry.messaging?.[0];
  if (!messaging) return 'unknown';

  if (messaging.read) return 'read';
  if (messaging.reaction) return 'reaction';
  if (messaging.postback) return 'postback';

  const attachment = messaging.message?.attachments?.[0];
  if (attachment) {
    if (attachment.type === 'ig_reel') return 'reel';
    if (attachment.type === 'story_mention') return 'story_mention';
    return attachment.type as any;
  }

  if (messaging.message?.text) return 'text';

  return 'unknown';
}

// Factory
export function createInstagramClient(config: InstagramConfig): InstagramMessagingAPI {
  return new InstagramMessagingAPI(config);
}
