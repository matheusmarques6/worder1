// ============================================
// WORDER - Sistema de Integrações
// Tipos e interfaces para processamento de webhooks
// ============================================

// Contato unificado (normalizado)
export interface UnifiedContact {
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailNormalized?: string;
  phone?: string;
  phoneNormalized?: string;
  whatsappJid?: string;
  company?: string;
  position?: string;
  source: string;
  platform: string;
  externalId?: string;
  tags: string[];
  customFields: Record<string, any>;
  rawPayload?: Record<string, any>;
}

// Resultado da deduplicação
export interface DeduplicationResult {
  contactId: string | null;
  isNew: boolean;
  matchType: 'external_id' | 'email' | 'whatsapp_jid' | 'phone' | 'fuzzy' | 'new';
  confidence: number;
}

// Configuração de mapeamento de campos
export interface FieldMapping {
  sourceField: string;
  targetField: keyof UnifiedContact | string;
  transform?: 'lowercase' | 'uppercase' | 'trim' | 'phone' | 'email' | 'date' | 'json';
  defaultValue?: any;
}

// Resultado do processamento de webhook
export interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  action: 'created' | 'updated' | 'skipped' | 'failed';
  contactId?: string;
  dealId?: string;
  deduplication?: DeduplicationResult;
  error?: string;
  processingTimeMs: number;
}

// Payload de evento de webhook
export interface WebhookEvent {
  id: string;
  webhookToken: string;
  installedIntegrationId: string;
  eventType: string;
  payload: Record<string, any>;
  headers: Record<string, string>;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'skipped';
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  idempotencyKey?: string;
}

// Integração instalada
export interface InstalledIntegration {
  id: string;
  organizationId: string;
  integrationId: string;
  status: 'pending' | 'configuring' | 'active' | 'paused' | 'error' | 'disconnected';
  configuration: Record<string, any>;
  fieldMapping: Record<string, FieldMapping>;
  defaultPipelineId?: string;
  defaultStageId?: string;
  autoTags: string[];
  webhookToken: string;
  lastSyncAt?: Date;
  errorCount: number;
}

// ============================================
// TIPOS ESPECÍFICOS POR PLATAFORMA
// ============================================

// Shopify
export interface ShopifyCustomer {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
  default_address?: {
    company?: string;
    city?: string;
    province?: string;
    country?: string;
  };
  tags?: string;
  note?: string;
  orders_count?: number;
  total_spent?: string;
  accepts_marketing?: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShopifyOrder {
  id: number;
  email?: string;
  phone?: string;
  customer?: ShopifyCustomer;
  billing_address?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    phone?: string;
  };
  total_price: string;
  financial_status: string;
  fulfillment_status?: string;
  line_items: Array<{
    title: string;
    quantity: number;
    price: string;
  }>;
  created_at: string;
}

export interface ShopifyCheckout {
  id: number;
  token: string;
  email?: string;
  phone?: string;
  customer?: ShopifyCustomer;
  billing_address?: ShopifyOrder['billing_address'];
  total_price: string;
  line_items: Array<{
    title: string;
    quantity: number;
    price: string;
  }>;
  abandoned_checkout_url: string;
  created_at: string;
}

// WhatsApp Cloud API
export interface WhatsAppCloudMessage {
  object: 'whatsapp_business_account';
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'contacts' | 'sticker' | 'interactive' | 'button' | 'reaction';
          text?: { body: string };
          image?: { id: string; mime_type: string; sha256: string; caption?: string };
          video?: { id: string; mime_type: string; sha256: string; caption?: string };
          audio?: { id: string; mime_type: string; sha256: string };
          document?: { id: string; mime_type: string; sha256: string; filename?: string; caption?: string };
          location?: { latitude: number; longitude: number; name?: string; address?: string };
          contacts?: Array<{ name: { formatted_name: string }; phones: Array<{ phone: string }> }>;
          reaction?: { message_id: string; emoji: string };
          context?: { from: string; id: string };
        }>;
        statuses?: Array<{
          id: string;
          status: 'sent' | 'delivered' | 'read' | 'failed';
          timestamp: string;
          recipient_id: string;
          errors?: Array<{ code: number; title: string }>;
        }>;
      };
      field: 'messages';
    }>;
  }>;
}

// Evolution API
export interface EvolutionMessage {
  event: 'messages.upsert' | 'messages.update' | 'connection.update' | 'qrcode.updated' | 'contacts.upsert' | 'send.message';
  instance: string;
  data: {
    key: {
      remoteJid: string;
      fromMe: boolean;
      id: string;
    };
    pushName?: string;
    message?: {
      conversation?: string;
      extendedTextMessage?: { text: string; contextInfo?: any };
      imageMessage?: { url?: string; mimetype: string; caption?: string };
      videoMessage?: { url?: string; mimetype: string; caption?: string };
      audioMessage?: { url?: string; mimetype: string; ptt: boolean };
      documentMessage?: { url?: string; mimetype: string; fileName?: string; caption?: string };
      locationMessage?: { degreesLatitude: number; degreesLongitude: number; name?: string; address?: string };
      contactMessage?: { displayName: string; vcard: string };
      stickerMessage?: { url?: string; mimetype: string };
      reactionMessage?: { key: { id: string }; text: string };
    };
    messageTimestamp?: number | string;
    status?: 'PENDING' | 'SERVER_ACK' | 'DELIVERY_ACK' | 'READ' | 'PLAYED';
  };
}

export interface EvolutionConnectionUpdate {
  event: 'connection.update';
  instance: string;
  data: {
    state: 'open' | 'connecting' | 'close';
    statusReason?: number;
  };
}

export interface EvolutionQRCode {
  event: 'qrcode.updated';
  instance: string;
  data: {
    qrcode: {
      base64: string;
      code: string;
    };
  };
}

// Facebook Lead Ads
export interface FacebookLeadAdWebhook {
  object: 'page';
  entry: Array<{
    id: string;
    time: number;
    changes: Array<{
      field: 'leadgen';
      value: {
        leadgen_id: string;
        form_id: string;
        page_id: string;
        ad_id?: string;
        adgroup_id?: string;
        created_time: number;
      };
    }>;
  }>;
}

export interface FacebookLeadData {
  id: string;
  created_time: string;
  form_id: string;
  field_data: Array<{
    name: string;
    values: string[];
  }>;
}

// Google Forms
export interface GoogleFormsResponse {
  eventType: 'RESPONSES';
  formId: string;
  responseId: string;
  response: {
    responseId: string;
    createTime: string;
    lastSubmittedTime: string;
    answers: Record<string, {
      questionId: string;
      textAnswers?: { answers: Array<{ value: string }> };
      fileUploadAnswers?: { answers: Array<{ fileId: string; fileName: string; mimeType: string }> };
    }>;
  };
  formMetadata?: {
    title: string;
    description?: string;
    items: Array<{
      itemId: string;
      title: string;
      description?: string;
      questionItem?: {
        question: {
          questionId: string;
          required?: boolean;
        };
      };
    }>;
  };
}

// Typeform
export interface TypeformResponse {
  event_id: string;
  event_type: 'form_response';
  form_response: {
    form_id: string;
    token: string;
    submitted_at: string;
    landed_at: string;
    calculated: {
      score: number;
    };
    hidden?: Record<string, string>;
    definition: {
      id: string;
      title: string;
      fields: Array<{
        id: string;
        ref: string;
        type: string;
        title: string;
      }>;
    };
    answers: Array<{
      type: string;
      field: { id: string; ref: string; type: string };
      text?: string;
      email?: string;
      phone_number?: string;
      number?: number;
      boolean?: boolean;
      date?: string;
      choice?: { label: string };
      choices?: { labels: string[] };
      file_url?: string;
    }>;
  };
}

// Google Sheets
export interface GoogleSheetsRowData {
  spreadsheetId: string;
  sheetName: string;
  rowNumber: number;
  values: Record<string, string>;
  timestamp?: string;
}

// Web Form (Formulário próprio)
export interface WebFormSubmission {
  formId: string;
  formName?: string;
  submittedAt: string;
  source: {
    url?: string;
    referrer?: string;
    userAgent?: string;
    ip?: string;
  };
  fields: Record<string, any>;
  utmParams?: {
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_term?: string;
    utm_content?: string;
  };
}

// ============================================
// TIPOS DE INSTÂNCIA WHATSAPP
// ============================================

export type WhatsAppProvider = 'evolution' | 'cloud_api' | 'baileys';

export interface WhatsAppInstance {
  id: string;
  organizationId: string;
  installedIntegrationId?: string;
  provider: WhatsAppProvider;
  instanceName: string;
  phoneNumber?: string;
  phoneNumberId?: string; // Cloud API
  wabaId?: string;
  status: 'disconnected' | 'connecting' | 'qr_pending' | 'connected' | 'error';
  qrCode?: string;
  qrExpiresAt?: Date;
  settings: {
    rejectCalls?: boolean;
    msgCall?: string;
    groupsIgnore?: boolean;
    alwaysOnline?: boolean;
    readMessages?: boolean;
    readStatus?: boolean;
    syncFullHistory?: boolean;
  };
  webhookUrl?: string;
  webhookEvents?: string[];
  apiKey?: string;
  accessToken?: string;
  messagesSent: number;
  messagesReceived: number;
  contactsSynced: number;
  lastMessageAt?: Date;
  autoReplyEnabled: boolean;
  autoReplyMessage?: string;
  autoReplyDelaySeconds: number;
}

export interface WhatsAppConversation {
  id: string;
  organizationId: string;
  instanceId: string;
  contactId?: string;
  chatId: string;
  chatType: 'individual' | 'group' | 'broadcast';
  remoteJid: string;
  pushName?: string;
  profilePictureUrl?: string;
  status: 'open' | 'pending' | 'resolved' | 'spam';
  assignedTo?: string;
  lastMessagePreview?: string;
  lastMessageAt?: Date;
  lastMessageType?: string;
  lastMessageDirection?: 'inbound' | 'outbound';
  unreadCount: number;
  totalMessages: number;
  labels: string[];
  notes: Array<{ text: string; createdAt: string; createdBy: string }>;
  chatbotEnabled: boolean;
  chatbotPausedUntil?: Date;
  currentFlowId?: string;
  flowState?: Record<string, any>;
}

export interface WhatsAppMessage {
  id: string;
  organizationId: string;
  instanceId: string;
  conversationId: string;
  messageId: string;
  remoteJid: string;
  direction: 'inbound' | 'outbound';
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed' | 'deleted';
  messageType: string;
  content: Record<string, any>;
  textBody?: string;
  caption?: string;
  mediaUrl?: string;
  mediaMimeType?: string;
  mediaFilename?: string;
  mediaSize?: number;
  quotedMessageId?: string;
  quotedContent?: Record<string, any>;
  reaction?: string;
  reactionBy?: string;
  fromMe: boolean;
  senderName?: string;
  senderPhone?: string;
  timestamp: Date;
  isRead: boolean;
  isStarred: boolean;
  isForwarded: boolean;
  isEdited: boolean;
  errorCode?: string;
  errorMessage?: string;
}
