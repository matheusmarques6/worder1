// ============================================
// WORDER - Normalizadores de Dados por Plataforma
// Converte dados específicos de cada plataforma para formato unificado
// ============================================

import type {
  UnifiedContact,
  ShopifyCustomer,
  ShopifyOrder,
  ShopifyCheckout,
  WhatsAppCloudMessage,
  EvolutionMessage,
  FacebookLeadData,
  GoogleFormsResponse,
  TypeformResponse,
  GoogleSheetsRowData,
  WebFormSubmission,
  FieldMapping,
} from './types';

// ============================================
// UTILITÁRIOS DE NORMALIZAÇÃO
// ============================================

/**
 * Normaliza email para formato padrão (lowercase + trim)
 */
export function normalizeEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  return email.toLowerCase().trim();
}

/**
 * Normaliza telefone para formato E.164
 */
export function normalizePhone(phone: string | null | undefined): string | undefined {
  if (!phone) return undefined;
  
  // Remove tudo exceto dígitos e +
  let cleaned = phone.replace(/[^0-9+]/g, '');
  
  // Se começa com 0, assume Brasil e adiciona +55
  if (cleaned.match(/^0[0-9]/)) {
    cleaned = '+55' + cleaned.substring(1);
  }
  
  // Se não começa com +, assume Brasil
  if (!cleaned.startsWith('+')) {
    // Se tem 10-11 dígitos, é número brasileiro sem código
    if (cleaned.length >= 10 && cleaned.length <= 11) {
      cleaned = '+55' + cleaned;
    }
    // Se tem 12-13 dígitos, já tem código do país
    else if (cleaned.length >= 12 && cleaned.length <= 13) {
      cleaned = '+' + cleaned;
    }
  }
  
  return cleaned || undefined;
}

/**
 * Extrai número do WhatsApp JID (formato: número@s.whatsapp.net)
 */
export function extractPhoneFromJid(jid: string): string {
  return jid.split('@')[0].split(':')[0];
}

/**
 * Converte JID para formato normalizado
 */
export function normalizeWhatsAppJid(jid: string): string {
  const phone = extractPhoneFromJid(jid);
  return `${phone}@s.whatsapp.net`;
}

/**
 * Aplica mapeamento de campos customizado
 */
export function applyFieldMapping(
  data: Record<string, any>,
  mapping: Record<string, FieldMapping>
): Record<string, any> {
  const result: Record<string, any> = {};

  for (const [key, config] of Object.entries(mapping)) {
    let value = getNestedValue(data, config.sourceField);

    // Aplica transformação se especificada
    if (value !== undefined && config.transform) {
      switch (config.transform) {
        case 'lowercase':
          value = String(value).toLowerCase();
          break;
        case 'uppercase':
          value = String(value).toUpperCase();
          break;
        case 'trim':
          value = String(value).trim();
          break;
        case 'phone':
          value = normalizePhone(String(value));
          break;
        case 'email':
          value = normalizeEmail(String(value));
          break;
        case 'date':
          value = new Date(value).toISOString();
          break;
        case 'json':
          try {
            value = JSON.parse(value);
          } catch {
            // Mantém valor original se não for JSON válido
          }
          break;
      }
    }

    // Usa valor default se não encontrado
    if (value === undefined && config.defaultValue !== undefined) {
      value = config.defaultValue;
    }

    if (value !== undefined) {
      result[config.targetField] = value;
    }
  }

  return result;
}

/**
 * Obtém valor aninhado de objeto (ex: "customer.address.city")
 */
function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split('.').reduce((current, key) => {
    return current?.[key];
  }, obj);
}

// ============================================
// NORMALIZADORES POR PLATAFORMA
// ============================================

/**
 * Normaliza dados de cliente Shopify
 */
export function normalizeShopifyCustomer(
  customer: ShopifyCustomer,
  eventType: 'customer_created' | 'customer_updated' = 'customer_created'
): UnifiedContact {
  const tags: string[] = [];
  
  // Tags do Shopify
  if (customer.tags) {
    tags.push(...customer.tags.split(',').map(t => t.trim()).filter(Boolean));
  }
  
  // Tags automáticas
  if (customer.accepts_marketing) {
    tags.push('aceita-marketing');
  }
  if (customer.orders_count && customer.orders_count > 0) {
    tags.push('cliente');
    if (customer.orders_count >= 5) {
      tags.push('cliente-frequente');
    }
  }
  tags.push('shopify');

  return {
    name: [customer.first_name, customer.last_name].filter(Boolean).join(' ') || undefined,
    firstName: customer.first_name || undefined,
    lastName: customer.last_name || undefined,
    email: customer.email || undefined,
    emailNormalized: normalizeEmail(customer.email),
    phone: customer.phone || undefined,
    phoneNormalized: normalizePhone(customer.phone),
    company: customer.default_address?.company || undefined,
    source: eventType === 'customer_created' ? 'shopify_customer' : 'shopify_update',
    platform: 'shopify',
    externalId: String(customer.id),
    tags: [...new Set(tags)],
    customFields: {
      shopify_customer_id: customer.id,
      orders_count: customer.orders_count,
      total_spent: customer.total_spent,
      accepts_marketing: customer.accepts_marketing,
      note: customer.note,
      city: customer.default_address?.city,
      state: customer.default_address?.province,
      country: customer.default_address?.country,
    },
    rawPayload: customer,
  };
}

/**
 * Normaliza dados de pedido Shopify
 */
export function normalizeShopifyOrder(order: ShopifyOrder): UnifiedContact {
  const customer = order.customer;
  const tags: string[] = ['shopify', 'pedido'];

  // Tags baseadas no status
  if (order.financial_status === 'paid') {
    tags.push('pagamento-confirmado');
  }
  if (order.fulfillment_status === 'fulfilled') {
    tags.push('entregue');
  }

  const name = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(' ')
    : [order.billing_address?.first_name, order.billing_address?.last_name].filter(Boolean).join(' ');

  return {
    name: name || undefined,
    firstName: customer?.first_name || order.billing_address?.first_name || undefined,
    lastName: customer?.last_name || order.billing_address?.last_name || undefined,
    email: order.email || customer?.email || undefined,
    emailNormalized: normalizeEmail(order.email || customer?.email),
    phone: order.phone || customer?.phone || order.billing_address?.phone || undefined,
    phoneNormalized: normalizePhone(order.phone || customer?.phone || order.billing_address?.phone),
    company: order.billing_address?.company || customer?.default_address?.company || undefined,
    source: 'shopify_order',
    platform: 'shopify',
    externalId: customer ? String(customer.id) : `order_${order.id}`,
    tags: [...new Set(tags)],
    customFields: {
      shopify_order_id: order.id,
      order_total: order.total_price,
      financial_status: order.financial_status,
      fulfillment_status: order.fulfillment_status,
      items: order.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      order_date: order.created_at,
    },
    rawPayload: order,
  };
}

/**
 * Normaliza dados de carrinho abandonado Shopify
 */
export function normalizeShopifyCheckout(checkout: ShopifyCheckout): UnifiedContact {
  const customer = checkout.customer;
  const tags: string[] = ['shopify', 'carrinho-abandonado'];

  const name = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(' ')
    : [checkout.billing_address?.first_name, checkout.billing_address?.last_name].filter(Boolean).join(' ');

  return {
    name: name || undefined,
    firstName: customer?.first_name || checkout.billing_address?.first_name || undefined,
    lastName: customer?.last_name || checkout.billing_address?.last_name || undefined,
    email: checkout.email || customer?.email || undefined,
    emailNormalized: normalizeEmail(checkout.email || customer?.email),
    phone: checkout.phone || customer?.phone || checkout.billing_address?.phone || undefined,
    phoneNormalized: normalizePhone(checkout.phone || customer?.phone || checkout.billing_address?.phone),
    company: checkout.billing_address?.company || undefined,
    source: 'shopify_abandoned_cart',
    platform: 'shopify',
    externalId: customer ? String(customer.id) : `checkout_${checkout.id}`,
    tags: [...new Set(tags)],
    customFields: {
      shopify_checkout_id: checkout.id,
      checkout_token: checkout.token,
      cart_total: checkout.total_price,
      recovery_url: checkout.abandoned_checkout_url,
      items: checkout.line_items.map(item => ({
        title: item.title,
        quantity: item.quantity,
        price: item.price,
      })),
      abandoned_at: checkout.created_at,
    },
    rawPayload: checkout,
  };
}

/**
 * Normaliza mensagem da WhatsApp Cloud API
 */
export function normalizeWhatsAppCloudMessage(payload: WhatsAppCloudMessage): UnifiedContact | null {
  const entry = payload.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.contacts?.[0] || !value?.messages?.[0]) {
    return null;
  }

  const contact = value.contacts[0];
  const message = value.messages[0];
  const phone = message.from;
  const whatsappJid = `${phone}@s.whatsapp.net`;

  return {
    name: contact.profile.name || undefined,
    phone: phone,
    phoneNormalized: normalizePhone(phone),
    whatsappJid,
    source: 'whatsapp_cloud_api',
    platform: 'whatsapp',
    externalId: contact.wa_id,
    tags: ['whatsapp', 'mensagem-recebida'],
    customFields: {
      wa_id: contact.wa_id,
      phone_number_id: value.metadata.phone_number_id,
      first_message_id: message.id,
      first_message_type: message.type,
      first_message_text: message.text?.body || message.caption,
      first_message_timestamp: message.timestamp,
    },
    rawPayload: payload,
  };
}

/**
 * Normaliza mensagem da Evolution API
 */
export function normalizeEvolutionMessage(payload: EvolutionMessage): UnifiedContact | null {
  if (payload.event !== 'messages.upsert') {
    return null;
  }

  const { data } = payload;
  const remoteJid = data.key.remoteJid;

  // Ignora grupos e broadcasts
  if (remoteJid.includes('@g.us') || remoteJid.includes('@broadcast')) {
    return null;
  }

  // Ignora mensagens enviadas por mim
  if (data.key.fromMe) {
    return null;
  }

  const phone = extractPhoneFromJid(remoteJid);
  const whatsappJid = normalizeWhatsAppJid(remoteJid);

  // Extrai texto da mensagem
  let messageText: string | undefined;
  if (data.message?.conversation) {
    messageText = data.message.conversation;
  } else if (data.message?.extendedTextMessage?.text) {
    messageText = data.message.extendedTextMessage.text;
  } else if (data.message?.imageMessage?.caption) {
    messageText = data.message.imageMessage.caption;
  } else if (data.message?.videoMessage?.caption) {
    messageText = data.message.videoMessage.caption;
  } else if (data.message?.documentMessage?.caption) {
    messageText = data.message.documentMessage.caption;
  }

  return {
    name: data.pushName || undefined,
    phone,
    phoneNormalized: normalizePhone(phone),
    whatsappJid,
    source: 'whatsapp_evolution',
    platform: 'whatsapp',
    externalId: phone,
    tags: ['whatsapp', 'mensagem-recebida'],
    customFields: {
      instance: payload.instance,
      push_name: data.pushName,
      first_message_id: data.key.id,
      first_message_text: messageText,
      first_message_timestamp: data.messageTimestamp,
    },
    rawPayload: payload,
  };
}

/**
 * Normaliza lead do Facebook Lead Ads
 */
export function normalizeFacebookLead(leadData: FacebookLeadData): UnifiedContact {
  const fields: Record<string, string> = {};
  
  // Mapeia campos do formulário
  for (const field of leadData.field_data) {
    fields[field.name.toLowerCase()] = field.values[0];
  }

  // Tenta encontrar campos comuns
  const email = fields.email || fields.e_mail || fields['e-mail'];
  const phone = fields.phone || fields.phone_number || fields.telefone || fields.celular;
  const name = fields.full_name || fields.name || fields.nome;
  const firstName = fields.first_name || fields.nome;
  const lastName = fields.last_name || fields.sobrenome;
  const company = fields.company || fields.empresa || fields.company_name;

  return {
    name: name || [firstName, lastName].filter(Boolean).join(' ') || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: email || undefined,
    emailNormalized: normalizeEmail(email),
    phone: phone || undefined,
    phoneNormalized: normalizePhone(phone),
    company: company || undefined,
    source: 'facebook_lead_ads',
    platform: 'facebook',
    externalId: leadData.id,
    tags: ['facebook', 'lead-ads'],
    customFields: {
      lead_id: leadData.id,
      form_id: leadData.form_id,
      created_time: leadData.created_time,
      ...fields,
    },
    rawPayload: leadData,
  };
}

/**
 * Normaliza resposta do Google Forms
 */
export function normalizeGoogleFormsResponse(
  response: GoogleFormsResponse,
  questionTitles?: Record<string, string>
): UnifiedContact {
  const fields: Record<string, any> = {};
  
  // Mapeia respostas
  for (const [questionId, answer] of Object.entries(response.response.answers)) {
    const title = questionTitles?.[questionId] || questionId;
    const normalizedTitle = title.toLowerCase().replace(/\s+/g, '_');
    
    if (answer.textAnswers?.answers?.[0]?.value) {
      fields[normalizedTitle] = answer.textAnswers.answers[0].value;
    } else if (answer.fileUploadAnswers?.answers?.[0]) {
      fields[normalizedTitle] = {
        fileId: answer.fileUploadAnswers.answers[0].fileId,
        fileName: answer.fileUploadAnswers.answers[0].fileName,
      };
    }
  }

  // Tenta encontrar campos comuns
  const email = fields.email || fields.e_mail || fields['e-mail'] || fields.email_address;
  const phone = fields.phone || fields.telefone || fields.celular || fields.phone_number || fields.whatsapp;
  const name = fields.name || fields.nome || fields.full_name || fields.nome_completo;
  const company = fields.company || fields.empresa;

  return {
    name: name || undefined,
    email: email || undefined,
    emailNormalized: normalizeEmail(email),
    phone: phone || undefined,
    phoneNormalized: normalizePhone(phone),
    company: company || undefined,
    source: 'google_forms',
    platform: 'google',
    externalId: response.response.responseId,
    tags: ['google-forms', 'formulario'],
    customFields: {
      form_id: response.formId,
      response_id: response.response.responseId,
      submitted_at: response.response.lastSubmittedTime,
      ...fields,
    },
    rawPayload: response,
  };
}

/**
 * Normaliza resposta do Typeform
 */
export function normalizeTypeformResponse(response: TypeformResponse): UnifiedContact {
  const fields: Record<string, any> = {};
  
  // Mapeia respostas por ref do campo
  for (const answer of response.form_response.answers) {
    const ref = answer.field.ref;
    
    if (answer.text) {
      fields[ref] = answer.text;
    } else if (answer.email) {
      fields[ref] = answer.email;
      fields['_email'] = answer.email;
    } else if (answer.phone_number) {
      fields[ref] = answer.phone_number;
      fields['_phone'] = answer.phone_number;
    } else if (answer.number !== undefined) {
      fields[ref] = answer.number;
    } else if (answer.boolean !== undefined) {
      fields[ref] = answer.boolean;
    } else if (answer.date) {
      fields[ref] = answer.date;
    } else if (answer.choice) {
      fields[ref] = answer.choice.label;
    } else if (answer.choices) {
      fields[ref] = answer.choices.labels;
    } else if (answer.file_url) {
      fields[ref] = answer.file_url;
    }
  }

  // Usa campos detectados ou tenta encontrar por nome/ref comum
  const email = fields['_email'] || fields.email || fields.e_mail;
  const phone = fields['_phone'] || fields.phone || fields.telefone || fields.whatsapp;
  const name = fields.name || fields.nome || fields.full_name;

  // Tags incluindo hidden fields (UTM)
  const tags: string[] = ['typeform', 'formulario'];
  if (response.form_response.hidden?.utm_source) {
    tags.push(`utm:${response.form_response.hidden.utm_source}`);
  }

  return {
    name: name || undefined,
    email: email || undefined,
    emailNormalized: normalizeEmail(email),
    phone: phone || undefined,
    phoneNormalized: normalizePhone(phone),
    source: 'typeform',
    platform: 'typeform',
    externalId: response.form_response.token,
    tags,
    customFields: {
      form_id: response.form_response.form_id,
      form_title: response.form_response.definition.title,
      token: response.form_response.token,
      submitted_at: response.form_response.submitted_at,
      score: response.form_response.calculated.score,
      hidden_fields: response.form_response.hidden,
      ...fields,
    },
    rawPayload: response,
  };
}

/**
 * Normaliza linha do Google Sheets
 */
export function normalizeGoogleSheetsRow(row: GoogleSheetsRowData): UnifiedContact {
  const { values } = row;
  
  // Normaliza chaves para lowercase
  const normalizedValues: Record<string, string> = {};
  for (const [key, value] of Object.entries(values)) {
    normalizedValues[key.toLowerCase().replace(/\s+/g, '_')] = value;
  }

  // Tenta encontrar campos comuns
  const email = normalizedValues.email || normalizedValues.e_mail || normalizedValues['e-mail'];
  const phone = normalizedValues.phone || normalizedValues.telefone || normalizedValues.celular || normalizedValues.whatsapp;
  const name = normalizedValues.name || normalizedValues.nome || normalizedValues.nome_completo;
  const firstName = normalizedValues.first_name || normalizedValues.primeiro_nome;
  const lastName = normalizedValues.last_name || normalizedValues.sobrenome || normalizedValues.ultimo_nome;
  const company = normalizedValues.company || normalizedValues.empresa;

  return {
    name: name || [firstName, lastName].filter(Boolean).join(' ') || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: email || undefined,
    emailNormalized: normalizeEmail(email),
    phone: phone || undefined,
    phoneNormalized: normalizePhone(phone),
    company: company || undefined,
    source: 'google_sheets',
    platform: 'google',
    externalId: `${row.spreadsheetId}_${row.sheetName}_${row.rowNumber}`,
    tags: ['google-sheets', 'planilha'],
    customFields: {
      spreadsheet_id: row.spreadsheetId,
      sheet_name: row.sheetName,
      row_number: row.rowNumber,
      imported_at: row.timestamp || new Date().toISOString(),
      ...normalizedValues,
    },
    rawPayload: row,
  };
}

/**
 * Normaliza submissão de formulário web próprio
 */
export function normalizeWebFormSubmission(submission: WebFormSubmission): UnifiedContact {
  const { fields } = submission;
  
  // Normaliza chaves para lowercase
  const normalizedFields: Record<string, any> = {};
  for (const [key, value] of Object.entries(fields)) {
    normalizedFields[key.toLowerCase().replace(/\s+/g, '_')] = value;
  }

  // Tenta encontrar campos comuns
  const email = normalizedFields.email || normalizedFields.e_mail;
  const phone = normalizedFields.phone || normalizedFields.telefone || normalizedFields.celular || normalizedFields.whatsapp;
  const name = normalizedFields.name || normalizedFields.nome || normalizedFields.nome_completo;
  const firstName = normalizedFields.first_name || normalizedFields.primeiro_nome;
  const lastName = normalizedFields.last_name || normalizedFields.sobrenome;
  const company = normalizedFields.company || normalizedFields.empresa;

  // Tags com UTM
  const tags: string[] = ['web-form', 'formulario'];
  if (submission.utmParams?.utm_source) {
    tags.push(`utm:${submission.utmParams.utm_source}`);
  }
  if (submission.utmParams?.utm_campaign) {
    tags.push(`campanha:${submission.utmParams.utm_campaign}`);
  }

  return {
    name: name || [firstName, lastName].filter(Boolean).join(' ') || undefined,
    firstName: firstName || undefined,
    lastName: lastName || undefined,
    email: email || undefined,
    emailNormalized: normalizeEmail(email),
    phone: phone || undefined,
    phoneNormalized: normalizePhone(phone),
    company: company || undefined,
    source: 'web_form',
    platform: 'website',
    externalId: `${submission.formId}_${Date.now()}`,
    tags,
    customFields: {
      form_id: submission.formId,
      form_name: submission.formName,
      submitted_at: submission.submittedAt,
      source_url: submission.source.url,
      referrer: submission.source.referrer,
      utm_params: submission.utmParams,
      ...normalizedFields,
    },
    rawPayload: submission,
  };
}

// ============================================
// NORMALIZADOR UNIVERSAL
// ============================================

export type PlatformType = 
  | 'shopify_customer' 
  | 'shopify_order' 
  | 'shopify_checkout'
  | 'whatsapp_cloud_api'
  | 'whatsapp_evolution'
  | 'facebook_lead_ads'
  | 'google_forms'
  | 'typeform'
  | 'google_sheets'
  | 'web_form'
  | 'generic';

/**
 * Normaliza dados de qualquer plataforma suportada
 */
export function normalizeWebhookPayload(
  platform: PlatformType,
  payload: any,
  options?: {
    fieldMapping?: Record<string, FieldMapping>;
    questionTitles?: Record<string, string>; // Para Google Forms
  }
): UnifiedContact | null {
  let contact: UnifiedContact | null = null;

  switch (platform) {
    case 'shopify_customer':
      contact = normalizeShopifyCustomer(payload);
      break;
    case 'shopify_order':
      contact = normalizeShopifyOrder(payload);
      break;
    case 'shopify_checkout':
      contact = normalizeShopifyCheckout(payload);
      break;
    case 'whatsapp_cloud_api':
      contact = normalizeWhatsAppCloudMessage(payload);
      break;
    case 'whatsapp_evolution':
      contact = normalizeEvolutionMessage(payload);
      break;
    case 'facebook_lead_ads':
      contact = normalizeFacebookLead(payload);
      break;
    case 'google_forms':
      contact = normalizeGoogleFormsResponse(payload, options?.questionTitles);
      break;
    case 'typeform':
      contact = normalizeTypeformResponse(payload);
      break;
    case 'google_sheets':
      contact = normalizeGoogleSheetsRow(payload);
      break;
    case 'web_form':
      contact = normalizeWebFormSubmission(payload);
      break;
    case 'generic':
    default:
      // Tenta normalização genérica
      contact = {
        name: payload.name || payload.nome,
        email: payload.email,
        emailNormalized: normalizeEmail(payload.email),
        phone: payload.phone || payload.telefone,
        phoneNormalized: normalizePhone(payload.phone || payload.telefone),
        company: payload.company || payload.empresa,
        source: 'generic_webhook',
        platform: 'unknown',
        externalId: payload.id || payload.external_id,
        tags: ['webhook'],
        customFields: payload,
        rawPayload: payload,
      };
  }

  // Aplica mapeamento customizado se fornecido
  if (contact && options?.fieldMapping) {
    const mappedFields = applyFieldMapping(payload, options.fieldMapping);
    contact = { ...contact, ...mappedFields };
  }

  return contact;
}
