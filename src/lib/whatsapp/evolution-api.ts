// =============================================
// EVOLUTION API CLIENT
// Conexão não-oficial via QR Code
// =============================================

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
