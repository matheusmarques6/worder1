export interface WhatsAppIntegration {
  id: string;
  user_id: string;
  phone_number: string;
  phone_number_id: string;
  business_account_id: string;
  access_token: string;
  webhook_secret?: string;
  status: 'active' | 'disconnected' | 'pending';
  created_at: string;
}

export interface WhatsAppConversation {
  id: string;
  user_id?: string;
  organization_id?: string;
  contact_id?: string;
  phone_number: string;
  contact_name?: string;
  last_message?: string;
  last_message_at?: string;
  last_message_preview?: string;
  unread_count: number;
  status: 'open' | 'closed' | 'pending';
  assigned_to?: string;
  assigned_agent_id?: string;
  created_at: string;
  updated_at?: string;
  // Novas propriedades do CRM
  origin?: 'meta' | 'qr';
  instance_id?: string;
  chat_note?: string;
  is_bot_active?: boolean;
  bot_disabled_until?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  source?: string;
  // Relações
  contact?: {
    id?: string;
    email?: string;
    phone?: string;
    total_orders?: number;
    total_spent?: number;
  };
  tags?: Array<{
    tag?: {
      id?: string;
      title?: string;
      color?: string;
    };
  }>;
  assigned_agent?: {
    id?: string;
    name?: string;
    email?: string;
  };
}

export interface WhatsAppMessage {
  id: string;
  conversation_id: string;
  from_number?: string;
  to_number?: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template';
  content: string;
  media_url?: string;
  status: 'pending' | 'sent' | 'delivered' | 'read' | 'failed';
  is_outgoing?: boolean;
  direction?: 'inbound' | 'outbound';
  sent_at?: string;
  delivered_at?: string;
  read_at?: string;
  created_at: string;
  meta_message_id?: string;
  wa_message_id?: string;
}

export interface WhatsAppTemplate {
  id: string;
  user_id: string;
  name: string;
  language: string;
  category: 'marketing' | 'utility' | 'authentication';
  status: 'approved' | 'pending' | 'rejected';
  components: WhatsAppTemplateComponent[];
  created_at: string;
}

export interface WhatsAppTemplateComponent {
  type: 'header' | 'body' | 'footer' | 'button';
  text?: string;
  format?: string;
  buttons?: { type: string; text: string; url?: string }[];
}
