// =============================================
// INSTAGRAM MESSAGING API - CLIENTE COMPLETO
// src/lib/instagram/api.ts
// =============================================

const META_API_VERSION = 'v19.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

// =============================================
// TIPOS
// =============================================

export interface InstagramConfig {
  instagramBusinessId: string;
  pageId: string;
  accessToken: string;
}

export interface SendMessageResult {
  recipient_id: string;
  message_id: string;
}

export interface InstagramUser {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
  is_verified_user?: boolean;
  is_business_follow_user?: boolean;
  is_user_follow_business?: boolean;
}

export interface InstagramConversation {
  id: string;
  participants: {
    data: Array<{ id: string; username?: string }>;
  };
  messages?: {
    data: InstagramMessage[];
  };
  updated_time?: string;
}

export interface InstagramMessage {
  id: string;
  created_time: string;
  from: { id: string; username?: string };
  to: { data: Array<{ id: string; username?: string }> };
  message?: string;
  attachments?: {
    data: Array<{
      id: string;
      type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'reel';
      url?: string;
      preview_url?: string;
    }>;
  };
  shares?: {
    data: Array<{
      link?: string;
      id?: string;
      name?: string;
    }>;
  };
  story?: {
    id: string;
    url?: string;
  };
  reactions?: {
    data: Array<{
      reaction: string;
      from: { id: string; username?: string };
    }>;
  };
  is_unsupported?: boolean;
}

export interface WebhookEntry {
  id: string;
  time: number;
  messaging?: WebhookMessaging[];
}

export interface WebhookMessaging {
  sender: { id: string };
  recipient: { id: string };
  timestamp: number;
  message?: {
    mid: string;
    text?: string;
    is_echo?: boolean;
    is_deleted?: boolean;
    attachments?: Array<{
      type: 'image' | 'video' | 'audio' | 'file' | 'share' | 'story_mention' | 'reel';
      payload: {
        url?: string;
        title?: string;
        sticker_id?: number;
        reel_video_id?: string;
      };
    }>;
    reply_to?: {
      mid?: string;
      story?: {
        id: string;
        url: string;
      };
    };
    referral?: {
      ref?: string;
      source?: string;
      type?: string;
    };
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
  postback?: {
    mid: string;
    title: string;
    payload: string;
  };
  referral?: {
    ref: string;
    source: string;
    type: string;
  };
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
  // ACCOUNT INFO
  // =============================================

  async getAccountInfo(): Promise<{
    id: string;
    username: string;
    name: string;
    profile_picture_url: string;
    followers_count: number;
    follows_count: number;
    media_count: number;
  }> {
    return this.request(
      `/${this.config.instagramBusinessId}?fields=id,username,name,profile_picture_url,followers_count,follows_count,media_count`
    );
  }

  async getPageInfo(): Promise<{
    id: string;
    name: string;
    instagram_business_account?: { id: string };
  }> {
    return this.request(
      `/${this.config.pageId}?fields=id,name,instagram_business_account`
    );
  }

  // =============================================
  // CONVERSATIONS
  // =============================================

  async getConversations(limit = 25, after?: string): Promise<{
    data: InstagramConversation[];
    paging?: { cursors: { before: string; after: string }; next?: string };
  }> {
    let url = `/${this.config.pageId}/conversations?platform=instagram&fields=id,participants,updated_time&limit=${limit}`;
    if (after) url += `&after=${after}`;
    return this.request(url);
  }

  async getConversation(conversationId: string): Promise<InstagramConversation> {
    return this.request(
      `/${conversationId}?fields=id,participants,messages{id,created_time,from,to,message,attachments,shares,story,reactions,is_unsupported}`
    );
  }

  async getConversationMessages(
    conversationId: string,
    limit = 50,
    after?: string
  ): Promise<{
    data: InstagramMessage[];
    paging?: { cursors: { before: string; after: string }; next?: string };
  }> {
    let url = `/${conversationId}/messages?fields=id,created_time,from,to,message,attachments,shares,story,reactions,is_unsupported&limit=${limit}`;
    if (after) url += `&after=${after}`;
    return this.request(url);
  }

  // =============================================
  // USER INFO
  // =============================================

  async getUserInfo(userId: string): Promise<InstagramUser> {
    return this.request(
      `/${userId}?fields=id,username,name,profile_picture_url,followers_count,is_verified_user,is_business_follow_user,is_user_follow_business`
    );
  }

  // =============================================
  // SEND MESSAGES
  // =============================================

  async sendText(recipientId: string, text: string): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
      }),
    });
  }

  async sendImage(
    recipientId: string,
    imageUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'image',
            payload: { url: imageUrl, is_reusable: true },
          },
        },
      }),
    });
  }

  async sendVideo(
    recipientId: string,
    videoUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'video',
            payload: { url: videoUrl, is_reusable: true },
          },
        },
      }),
    });
  }

  async sendAudio(
    recipientId: string,
    audioUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'audio',
            payload: { url: audioUrl, is_reusable: true },
          },
        },
      }),
    });
  }

  async sendFile(
    recipientId: string,
    fileUrl: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'file',
            payload: { url: fileUrl, is_reusable: true },
          },
        },
      }),
    });
  }

  async sendSticker(
    recipientId: string,
    stickerId: number
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'sticker',
              sticker_id: stickerId,
            },
          },
        },
      }),
    });
  }

  async sendReaction(
    recipientId: string,
    messageId: string,
    reaction: 'love' | 'like' | 'haha' | 'wow' | 'sad' | 'angry'
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
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

  async removeReaction(
    recipientId: string,
    messageId: string
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
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
  // QUICK REPLIES (Ice Breakers)
  // =============================================

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
    return this.request(`/${this.config.pageId}/messages`, {
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

  // =============================================
  // GENERIC TEMPLATE
  // =============================================

  async sendGenericTemplate(
    recipientId: string,
    elements: Array<{
      title: string;
      subtitle?: string;
      image_url?: string;
      default_action?: {
        type: 'web_url';
        url: string;
      };
      buttons?: Array<{
        type: 'web_url' | 'postback';
        title: string;
        url?: string;
        payload?: string;
      }>;
    }>
  ): Promise<SendMessageResult> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: {
          attachment: {
            type: 'template',
            payload: {
              template_type: 'generic',
              elements: elements.slice(0, 10), // Max 10 elements
            },
          },
        },
      }),
    });
  }

  // =============================================
  // TYPING INDICATOR
  // =============================================

  async sendTypingOn(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'typing_on',
      }),
    });
  }

  async sendTypingOff(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'typing_off',
      }),
    });
  }

  async markSeen(recipientId: string): Promise<{ recipient_id: string }> {
    return this.request(`/${this.config.pageId}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        recipient: { id: recipientId },
        sender_action: 'mark_seen',
      }),
    });
  }

  // =============================================
  // ICE BREAKERS (Menu de boas vindas)
  // =============================================

  async setIceBreakers(
    iceBreakers: Array<{
      question: string;
      payload: string;
    }>
  ): Promise<{ result: string }> {
    return this.request(`/${this.config.pageId}/messenger_profile`, {
      method: 'POST',
      body: JSON.stringify({
        platform: 'instagram',
        ice_breakers: iceBreakers.slice(0, 4), // Max 4 ice breakers
      }),
    });
  }

  async getIceBreakers(): Promise<{
    data: Array<{ ice_breakers?: Array<{ question: string; payload: string }> }>;
  }> {
    return this.request(
      `/${this.config.pageId}/messenger_profile?fields=ice_breakers&platform=instagram`
    );
  }

  async deleteIceBreakers(): Promise<{ result: string }> {
    return this.request(`/${this.config.pageId}/messenger_profile`, {
      method: 'DELETE',
      body: JSON.stringify({
        fields: ['ice_breakers'],
        platform: 'instagram',
      }),
    });
  }

  // =============================================
  // PERSISTENT MENU
  // =============================================

  async setPersistentMenu(
    menuItems: Array<{
      type: 'postback' | 'web_url';
      title: string;
      payload?: string;
      url?: string;
    }>
  ): Promise<{ result: string }> {
    return this.request(`/${this.config.pageId}/messenger_profile`, {
      method: 'POST',
      body: JSON.stringify({
        platform: 'instagram',
        persistent_menu: [
          {
            locale: 'default',
            composer_input_disabled: false,
            call_to_actions: menuItems.slice(0, 3), // Max 3 menu items
          },
        ],
      }),
    });
  }

  async deletePersistentMenu(): Promise<{ result: string }> {
    return this.request(`/${this.config.pageId}/messenger_profile`, {
      method: 'DELETE',
      body: JSON.stringify({
        fields: ['persistent_menu'],
        platform: 'instagram',
      }),
    });
  }

  // =============================================
  // WEBHOOKS
  // =============================================

  async subscribeWebhook(
    callbackUrl: string,
    verifyToken: string,
    fields: string[] = ['messages', 'messaging_postbacks', 'messaging_optins', 'messaging_referrals']
  ): Promise<{ success: boolean }> {
    return this.request(`/${this.config.pageId}/subscribed_apps`, {
      method: 'POST',
      body: JSON.stringify({
        subscribed_fields: fields,
      }),
    });
  }

  async getWebhookSubscriptions(): Promise<{
    data: Array<{
      id: string;
      name: string;
      subscribed_fields: string[];
    }>;
  }> {
    return this.request(`/${this.config.pageId}/subscribed_apps`);
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
  error_data?: any;

  constructor(error: any) {
    super(error.message || 'Instagram API Error');
    this.name = 'InstagramAPIError';
    this.code = error.code || 0;
    this.type = error.type || 'OAuthException';
    this.fbtrace_id = error.fbtrace_id || '';
    this.error_subcode = error.error_subcode;
    this.error_data = error.error_data;
  }

  isRateLimited(): boolean {
    return this.code === 4 || this.code === 613;
  }

  isWindowExpired(): boolean {
    // Instagram has 24h human agent window
    return this.code === 10 && this.error_subcode === 2534015;
  }

  isInvalidRecipient(): boolean {
    return this.code === 100 && this.error_subcode === 2018109;
  }

  isPermissionDenied(): boolean {
    return this.code === 200 || this.code === 230;
  }

  isTokenExpired(): boolean {
    return this.code === 190;
  }
}

// =============================================
// HELPERS
// =============================================

export function parseWebhookPayload(body: any): WebhookEntry[] {
  if (body.object !== 'instagram') return [];
  return body.entry || [];
}

export function extractMessaging(entry: WebhookEntry): WebhookMessaging[] {
  return entry.messaging || [];
}

export function isEchoMessage(messaging: WebhookMessaging): boolean {
  return messaging.message?.is_echo === true;
}

export function isDeletedMessage(messaging: WebhookMessaging): boolean {
  return messaging.message?.is_deleted === true;
}

export function getMessageType(messaging: WebhookMessaging): string {
  if (!messaging.message) {
    if (messaging.reaction) return 'reaction';
    if (messaging.read) return 'read';
    if (messaging.postback) return 'postback';
    if (messaging.referral) return 'referral';
    return 'unknown';
  }

  const attachments = messaging.message.attachments;
  if (!attachments || attachments.length === 0) return 'text';

  const type = attachments[0].type;
  if (type === 'story_mention') return 'story_mention';
  if (type === 'reel') return 'reel';
  if (type === 'share') return 'share';
  return type;
}

export function extractMessageText(messaging: WebhookMessaging): string {
  if (messaging.message?.text) return messaging.message.text;
  if (messaging.postback?.title) return messaging.postback.title;
  return '';
}

export function extractMediaUrl(messaging: WebhookMessaging): string | null {
  const attachments = messaging.message?.attachments;
  if (!attachments || attachments.length === 0) return null;
  return attachments[0].payload.url || null;
}

export function isStoryMention(messaging: WebhookMessaging): boolean {
  const attachments = messaging.message?.attachments;
  if (!attachments || attachments.length === 0) return false;
  return attachments[0].type === 'story_mention';
}

export function isStoryReply(messaging: WebhookMessaging): boolean {
  return !!messaging.message?.reply_to?.story;
}

export function getStoryInfo(messaging: WebhookMessaging): { id: string; url: string } | null {
  const story = messaging.message?.reply_to?.story;
  if (!story) return null;
  return { id: story.id, url: story.url };
}

export async function verifyWebhookSignature(
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

// Factory
export function createInstagramClient(config: InstagramConfig): InstagramMessagingAPI {
  return new InstagramMessagingAPI(config);
}
