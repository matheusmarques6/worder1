// =============================================
// EVOLUTION API CLIENT
// Conexão não-oficial via QR Code
// =============================================

export interface EvolutionConfig {
  serverUrl: string;
  apiKey: string;
  instanceName: string;
}

// Alias para compatibilidade
export interface EvolutionInstance {
  api_url: string;
  api_key: string;
  unique_id: string;
}

export interface EvolutionMessage {
  type: 'text' | 'image' | 'video' | 'audio' | 'document';
  content?: string;
  url?: string;
  caption?: string;
}

// =============================================
// CRIAR INSTÂNCIA
// =============================================
export async function createEvolutionInstance(params: { 
  apiUrl: string; 
  apiKey: string; 
  instanceName: string 
}) {
  try {
    const response = await fetch(`${params.apiUrl}/instance/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': params.apiKey,
      },
      body: JSON.stringify({
        instanceName: params.instanceName,
        qrcode: true,
        integration: 'WHATSAPP-BAILEYS',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return { success: false, error: data.message || 'Failed to create instance' };
    }

    return { success: true, data };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

// =============================================
// OBTER QR CODE
// =============================================
export async function getEvolutionQR(instance: EvolutionInstance) {
  try {
    const response = await fetch(`${instance.api_url}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': instance.api_key,
      },
    });

    const data = await response.json();

    if (data.base64) {
      return { qrcode: data.base64 };
    }

    if (data.instance?.state === 'open') {
      return { connected: true, phoneNumber: data.instance?.phoneNumber };
    }

    return { error: 'No QR code available' };
  } catch (error: any) {
    return { error: error.message };
  }
}

// =============================================
// OBTER STATUS
// =============================================
export async function getEvolutionStatus(instance: EvolutionInstance) {
  try {
    const response = await fetch(`${instance.api_url}/instance/connectionState/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': instance.api_key,
      },
    });

    const data = await response.json();

    return {
      connected: data.instance?.state === 'open',
      state: data.instance?.state,
      phoneNumber: data.instance?.phoneNumber,
    };
  } catch (error: any) {
    return { connected: false, error: error.message };
  }
}

// =============================================
// CONECTAR
// =============================================
export async function connectEvolution(instance: EvolutionInstance) {
  try {
    const response = await fetch(`${instance.api_url}/instance/connect/${instance.unique_id}`, {
      method: 'GET',
      headers: {
        'apikey': instance.api_key,
      },
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

// =============================================
// DESCONECTAR
// =============================================
export async function disconnectEvolution(instance: EvolutionInstance) {
  try {
    const response = await fetch(`${instance.api_url}/instance/logout/${instance.unique_id}`, {
      method: 'DELETE',
      headers: {
        'apikey': instance.api_key,
      },
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

// =============================================
// ENVIAR MENSAGEM
// =============================================
export async function sendEvolutionMessage(instance: EvolutionInstance, to: string, message: EvolutionMessage) {
  try {
    const endpoint = message.type === 'text' 
      ? 'sendText' 
      : message.type === 'image' 
        ? 'sendMedia' 
        : 'sendText';

    const body = message.type === 'text' 
      ? {
          number: to,
          text: message.content,
        }
      : {
          number: to,
          mediatype: message.type,
          media: message.url,
          caption: message.caption,
        };

    const response = await fetch(`${instance.api_url}/message/${endpoint}/${instance.unique_id}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': instance.api_key,
      },
      body: JSON.stringify(body),
    });

    return await response.json();
  } catch (error: any) {
    return { error: error.message };
  }
}

// =============================================
// ENVIAR TEXTO
// =============================================
export async function sendEvolutionText(instance: EvolutionInstance, to: string, text: string) {
  return sendEvolutionMessage(instance, to, { type: 'text', content: text });
}

// =============================================
// ENVIAR MÍDIA
// =============================================
export async function sendEvolutionMedia(
  instance: EvolutionInstance, 
  to: string, 
  mediaUrl: string, 
  mediaType: 'image' | 'video' | 'audio' | 'document',
  caption?: string
) {
  return sendEvolutionMessage(instance, to, { 
    type: mediaType, 
    url: mediaUrl, 
    caption 
  });
}

// =============================================
// CLASSE PRINCIPAL
// =============================================

export class EvolutionAPI {
  private config: EvolutionConfig;

  constructor(config: EvolutionConfig) {
    this.config = config;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.config.serverUrl}${endpoint}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'apikey': this.config.apiKey,
        ...options.headers,
      },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new EvolutionError(data.message || 'Evolution API error', response.status);
    }

    return data;
  }

  // =============================================
  // INSTÂNCIA
  // =============================================

  async createInstance(options: { qrcode?: boolean; integration?: string } = {}): Promise<any> {
    return this.request('/instance/create', {
      method: 'POST',
      body: JSON.stringify({
        instanceName: this.config.instanceName,
        qrcode: options.qrcode ?? true,
        integration: options.integration || 'WHATSAPP-BAILEYS',
      }),
    });
  }

  async getInstanceInfo(): Promise<any> {
    return this.request(`/instance/fetchInstances?instanceName=${this.config.instanceName}`);
  }

  async getConnectionState(): Promise<{ state: string; connected: boolean }> {
    const data = await this.request<any>(`/instance/connectionState/${this.config.instanceName}`);
    return {
      state: data.instance?.state || 'close',
      connected: data.instance?.state === 'open',
    };
  }

  async connect(): Promise<{ qrcode?: string; connected?: boolean; pairingCode?: string }> {
    const data = await this.request<any>(`/instance/connect/${this.config.instanceName}`);
    
    if (data.base64) {
      return { qrcode: data.base64 };
    }
    if (data.pairingCode) {
      return { pairingCode: data.pairingCode };
    }
    if (data.instance?.state === 'open') {
      return { connected: true };
    }
    
    return data;
  }

  async logout(): Promise<void> {
    await this.request(`/instance/logout/${this.config.instanceName}`, {
      method: 'DELETE',
    });
  }

  async deleteInstance(): Promise<void> {
    await this.request(`/instance/delete/${this.config.instanceName}`, {
      method: 'DELETE',
    });
  }

  async restart(): Promise<void> {
    await this.request(`/instance/restart/${this.config.instanceName}`, {
      method: 'PUT',
    });
  }

  // =============================================
  // MENSAGENS
  // =============================================

  async sendText(to: string, text: string): Promise<any> {
    return this.request(`/message/sendText/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        text,
      }),
    });
  }

  async sendMedia(
    to: string,
    mediaType: 'image' | 'video' | 'audio' | 'document',
    media: string,
    options: { caption?: string; fileName?: string; mimetype?: string } = {}
  ): Promise<any> {
    return this.request(`/message/sendMedia/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        mediatype: mediaType,
        media,
        caption: options.caption,
        fileName: options.fileName,
        mimetype: options.mimetype,
      }),
    });
  }

  async sendButtons(
    to: string,
    title: string,
    description: string,
    buttons: Array<{ buttonId: string; buttonText: string }>
  ): Promise<any> {
    return this.request(`/message/sendButtons/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        title,
        description,
        buttons,
      }),
    });
  }

  async sendList(
    to: string,
    title: string,
    description: string,
    buttonText: string,
    sections: Array<{
      title: string;
      rows: Array<{ title: string; description?: string; rowId: string }>;
    }>
  ): Promise<any> {
    return this.request(`/message/sendList/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        title,
        description,
        buttonText,
        sections,
      }),
    });
  }

  async sendLocation(
    to: string,
    latitude: number,
    longitude: number,
    options: { name?: string; address?: string } = {}
  ): Promise<any> {
    return this.request(`/message/sendLocation/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        latitude,
        longitude,
        name: options.name,
        address: options.address,
      }),
    });
  }

  async sendContact(
    to: string,
    contact: { fullName: string; wuid: string; phoneNumber: string }
  ): Promise<any> {
    return this.request(`/message/sendContact/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        number: normalizePhone(to),
        contact,
      }),
    });
  }

  async sendReaction(to: string, messageId: string, reaction: string): Promise<any> {
    return this.request(`/message/sendReaction/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        key: {
          remoteJid: `${normalizePhone(to)}@s.whatsapp.net`,
          id: messageId,
        },
        reaction,
      }),
    });
  }

  // =============================================
  // WEBHOOK
  // =============================================

  async setWebhook(url: string, events?: string[]): Promise<any> {
    return this.request(`/webhook/set/${this.config.instanceName}`, {
      method: 'POST',
      body: JSON.stringify({
        url,
        webhook_by_events: false,
        events: events || [
          'QRCODE_UPDATED',
          'MESSAGES_UPSERT',
          'MESSAGES_UPDATE',
          'SEND_MESSAGE',
          'CONNECTION_UPDATE',
        ],
      }),
    });
  }

  async getWebhook(): Promise<any> {
    return this.request(`/webhook/find/${this.config.instanceName}`);
  }

  // =============================================
  // GRUPOS
  // =============================================

  async listGroups(): Promise<any[]> {
    const data = await this.request<any>(`/group/fetchAllGroups/${this.config.instanceName}?getParticipants=false`);
    return data || [];
  }

  async getGroupInfo(groupId: string): Promise<any> {
    return this.request(`/group/findGroupInfos/${this.config.instanceName}?groupJid=${groupId}`);
  }

  // =============================================
  // CONTATOS
  // =============================================

  async getProfilePicture(number: string): Promise<string | null> {
    try {
      const data = await this.request<any>(`/chat/fetchProfilePictureUrl/${this.config.instanceName}?number=${normalizePhone(number)}`);
      return data.profilePictureUrl || null;
    } catch {
      return null;
    }
  }

  async checkNumber(number: string): Promise<{ exists: boolean; jid?: string }> {
    try {
      const data = await this.request<any>(`/chat/whatsappNumbers/${this.config.instanceName}`, {
        method: 'POST',
        body: JSON.stringify({ numbers: [normalizePhone(number)] }),
      });
      const result = data?.[0];
      return {
        exists: result?.exists || false,
        jid: result?.jid,
      };
    } catch {
      return { exists: false };
    }
  }
}

// =============================================
// ERRO
// =============================================

export class EvolutionError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'EvolutionError';
    this.status = status;
  }
}

// =============================================
// HELPER
// =============================================

function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

// =============================================
// FACTORY
// =============================================

export function createEvolutionClient(config: EvolutionConfig): EvolutionAPI {
  return new EvolutionAPI(config);
}

// =============================================
// WEBHOOK HANDLER
// =============================================

export interface EvolutionWebhookEvent {
  event: string;
  instance: string;
  data: any;
}

export function parseEvolutionWebhook(body: any): EvolutionWebhookEvent {
  return {
    event: body.event,
    instance: body.instance,
    data: body.data,
  };
}

export function isMessageEvent(event: EvolutionWebhookEvent): boolean {
  return event.event === 'messages.upsert';
}

export function isConnectionEvent(event: EvolutionWebhookEvent): boolean {
  return event.event === 'connection.update';
}

export function isQRCodeEvent(event: EvolutionWebhookEvent): boolean {
  return event.event === 'qrcode.updated';
}
