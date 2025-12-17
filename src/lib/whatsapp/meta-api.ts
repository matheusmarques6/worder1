// =============================================
// META WHATSAPP BUSINESS API CLIENT
// =============================================

const META_API_VERSION = 'v18.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;

interface SendMessageParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  content: any;
}

interface SendTemplateParams {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  templateName: string;
  languageCode: string;
  components?: any[];
}

// =============================================
// ENVIAR MENSAGEM DE TEXTO
// =============================================
export async function sendTextMessage(params: SendMessageParams): Promise<any> {
  const { phoneNumberId, accessToken, to, content } = params;
  
  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'text',
      text: { 
        preview_url: true,
        body: typeof content === 'string' ? content : content.text?.body || content.body || ''
      }
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send message');
  }
  
  return data;
}

// =============================================
// ENVIAR MENSAGEM DE MÍDIA
// =============================================
export async function sendMediaMessage(params: SendMessageParams & { mediaType: 'image' | 'video' | 'audio' | 'document' }): Promise<any> {
  const { phoneNumberId, accessToken, to, content, mediaType } = params;
  
  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: mediaType,
      [mediaType]: {
        link: content.link || content.url || content,
        caption: content.caption || ''
      }
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send media');
  }
  
  return data;
}

// =============================================
// ENVIAR TEMPLATE
// =============================================
export async function sendTemplateMessage(params: SendTemplateParams): Promise<any> {
  const { phoneNumberId, accessToken, to, templateName, languageCode, components } = params;
  
  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components: components || []
      }
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send template');
  }
  
  return data;
}

// =============================================
// ENVIAR MENSAGEM INTERATIVA (BOTÕES/LISTA)
// =============================================
export async function sendInteractiveMessage(params: SendMessageParams & { interactiveType: 'button' | 'list' }): Promise<any> {
  const { phoneNumberId, accessToken, to, content, interactiveType } = params;
  
  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normalizePhone(to),
      type: 'interactive',
      interactive: {
        type: interactiveType,
        ...content
      }
    }),
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to send interactive message');
  }
  
  return data;
}

// =============================================
// MARCAR COMO LIDO
// =============================================
export async function markAsRead(params: { phoneNumberId: string; accessToken: string; messageId: string }): Promise<any> {
  const { phoneNumberId, accessToken, messageId } = params;
  
  const response = await fetch(`${META_BASE_URL}/${phoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId
    }),
  });

  return response.json();
}

// =============================================
// BUSCAR TEMPLATES
// =============================================
export async function getTemplates(params: { wabaId: string; accessToken: string }): Promise<any> {
  const { wabaId, accessToken } = params;
  
  const response = await fetch(`${META_BASE_URL}/${wabaId}/message_templates?limit=100`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(data.error?.message || 'Failed to fetch templates');
  }
  
  return data.data || [];
}

// =============================================
// DOWNLOAD MEDIA
// =============================================
export async function downloadMedia(params: { mediaId: string; accessToken: string }): Promise<string> {
  // Primeiro, pegar URL do media
  const urlResponse = await fetch(`${META_BASE_URL}/${params.mediaId}`, {
    headers: {
      'Authorization': `Bearer ${params.accessToken}`,
    },
  });

  const urlData = await urlResponse.json();
  
  if (!urlData.url) {
    throw new Error('Media URL not found');
  }

  // Baixar o arquivo
  const mediaResponse = await fetch(urlData.url, {
    headers: {
      'Authorization': `Bearer ${params.accessToken}`,
    },
  });

  const buffer = await mediaResponse.arrayBuffer();
  const base64 = Buffer.from(buffer).toString('base64');
  
  return `data:${urlData.mime_type};base64,${base64}`;
}

// =============================================
// ENVIAR MENSAGEM GENÉRICA
// =============================================
export async function sendMessage(params: {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  type: 'text' | 'image' | 'video' | 'audio' | 'document' | 'template' | 'interactive';
  content: any;
  templateName?: string;
  languageCode?: string;
  components?: any[];
}): Promise<any> {
  const { type, ...rest } = params;
  
  switch (type) {
    case 'text':
      return sendTextMessage(rest);
    case 'image':
    case 'video':
    case 'audio':
    case 'document':
      return sendMediaMessage({ ...rest, mediaType: type });
    case 'template':
      return sendTemplateMessage({
        ...rest,
        templateName: params.templateName!,
        languageCode: params.languageCode || 'pt_BR',
        components: params.components
      });
    default:
      return sendTextMessage(rest);
  }
}

// =============================================
// NORMALIZAR TELEFONE
// =============================================
function normalizePhone(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  
  // Remover zero inicial
  if (cleaned.startsWith('0')) {
    cleaned = cleaned.substring(1);
  }
  
  // Adicionar código do Brasil se necessário
  if (cleaned.length === 10 || cleaned.length === 11) {
    cleaned = '55' + cleaned;
  }
  
  return cleaned;
}

export { normalizePhone };
