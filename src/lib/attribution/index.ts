// =============================================
// Atribuição de receita — ponto de entrada único
//
// Um pedido gera UM crédito. Os canais (e-mail, WhatsApp, SMS)
// disputam e apenas o toque vencedor leva a receita, como fazem
// Omnisend e Klaviyo. O modelo anterior rodava os três canais em
// paralelo e cada um creditava o valor CHEIO do mesmo pedido — a soma
// dos canais podia passar de 100% do faturamento da loja.
//
// A decisão vive na função attribute_order do Postgres, cuja chave
// primária (organization_id, order_id) torna a dupla contagem
// impossível por construção, mesmo com webhooks concorrentes (o
// Shopify dispara orders/create e orders/paid quase juntos e reenvia
// cada um até 8 vezes).
//
// Duas receitas saem daqui, como no relatório dos concorrentes:
//   'attributed' — houve engajamento na janela: a mensagem puxou.
//   'recipient'  — o contato recebeu mensagem mas não engajou: entra
//                  só na receita dos destinatários (totalRevenue).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

export type AttributionClassification = 'attributed' | 'recipient';
export type AttributionChannel = 'email' | 'whatsapp' | 'sms';

export interface AttributionCallInput {
  contactId: string;
  organizationId: string;
  orderId: string;
  orderValue: number;
  /** Data do PEDIDO. A janela é medida a partir daqui — não de "agora",
   *  senão pedido processado com atraso ou importado nunca atribui. */
  orderAt?: string | Date;
  /** Já reembolsado no momento da atribuição (reembolso parcial). */
  refunded?: number;
  currency?: string;
  storeId?: string | null;
}

export interface AttributionRevokeInput {
  organizationId: string;
  orderId: string;
}

export interface AttributionResult {
  attributed: boolean;
  classification?: AttributionClassification;
  channel?: AttributionChannel | null;
  sendId?: string | null;
  campaignId?: string | null;
  automationId?: string | null;
  netRevenue?: number;
}

interface OrgWindows {
  email_window_days: number;
  whatsapp_window_days: number;
  sms_window_days: number;
  count_opens: boolean;
  exclude_mpp_opens: boolean;
  model: 'last_touch' | 'first_touch';
}

const DEFAULT_WINDOWS: OrgWindows = {
  email_window_days: 5,
  whatsapp_window_days: 2,
  sms_window_days: 2,
  count_opens: true,
  exclude_mpp_opens: true,
  model: 'last_touch',
};

async function loadWindows(organizationId: string): Promise<OrgWindows> {
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('email_settings')
      .eq('id', organizationId)
      .single();
    const a = (org as any)?.email_settings?.attribution || {};
    // Number(x) || default trata 0 como ausente de propósito: janela
    // zero não faz sentido e a API já faz clamp em 1.
    return {
      email_window_days: Number(a.email_window_days) || DEFAULT_WINDOWS.email_window_days,
      whatsapp_window_days: Number(a.whatsapp_window_days) || DEFAULT_WINDOWS.whatsapp_window_days,
      sms_window_days: Number(a.sms_window_days) || DEFAULT_WINDOWS.sms_window_days,
      count_opens: a.count_opens !== false,
      exclude_mpp_opens: a.exclude_mpp_opens !== false,
      // first_touch existia na tela e na API mas o motor nunca lia —
      // escolher a opção não mudava nada. Agora chega ao SQL.
      model: a.model === 'first_touch' ? 'first_touch' : 'last_touch',
    };
  } catch {
    return { ...DEFAULT_WINDOWS };
  }
}

/**
 * Credita um pedido ao canal vencedor (ou o registra como receita de
 * destinatário quando ninguém engajou). Idempotente por pedido.
 */
export async function attributeOrder(input: AttributionCallInput): Promise<AttributionResult> {
  try {
    const w = await loadWindows(input.organizationId);
    const orderAt = input.orderAt ? new Date(input.orderAt).toISOString() : new Date().toISOString();

    const { data, error } = await supabaseAdmin.rpc('attribute_order', {
      p_organization_id: input.organizationId,
      p_order_id: input.orderId,
      p_contact_id: input.contactId,
      p_order_at: orderAt,
      p_gross_revenue: input.orderValue,
      p_refunded: input.refunded ?? 0,
      p_currency: input.currency || 'BRL',
      p_store_id: input.storeId ?? null,
      p_email_days: w.email_window_days,
      p_whatsapp_days: w.whatsapp_window_days,
      p_sms_days: w.sms_window_days,
      p_count_opens: w.count_opens,
      p_exclude_mpp: w.exclude_mpp_opens,
      p_model: w.model,
    });

    if (error) {
      console.error('[Attribution] attribute_order falhou:', error);
      return { attributed: false };
    }
    const row: any = Array.isArray(data) ? data[0] : data;
    if (!row?.order_id) return { attributed: false };

    console.log(
      `[Attribution] pedido ${input.orderId} → ${row.classification} ${row.channel || '(sem canal)'} ` +
      `líquido ${row.net_revenue}`
    );

    return {
      attributed: row.classification === 'attributed',
      classification: row.classification,
      channel: row.channel,
      sendId: row.send_id,
      campaignId: row.campaign_id,
      automationId: row.automation_id,
      netRevenue: Number(row.net_revenue) || 0,
    };
  } catch (err) {
    console.error('[Attribution] erro:', err);
    return { attributed: false };
  }
}

/** Reembolso (inclusive parcial): ajusta o valor creditado. */
export async function refundOrderAttribution(
  organizationId: string,
  orderId: string,
  refundedTotal: number
): Promise<boolean> {
  try {
    const { error } = await supabaseAdmin.rpc('refund_order_attribution', {
      p_organization_id: organizationId,
      p_order_id: orderId,
      p_refunded_total: refundedTotal,
    });
    if (error) {
      console.error('[Attribution] refund falhou:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('[Attribution] refund erro:', err);
    return false;
  }
}

/** Cancelamento: tira o pedido das somas de vez. */
export async function revokeOrderAttribution(input: AttributionRevokeInput): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('revoke_order_attribution', {
      p_organization_id: input.organizationId,
      p_order_id: input.orderId,
    });
    if (error) {
      console.error('[Attribution] revoke falhou:', error);
      return false;
    }
    return !!data;
  } catch (err) {
    console.error('[Attribution] revoke erro:', err);
    return false;
  }
}

// ---------------------------------------------------------------
// Compatibilidade com os chamadores existentes
// ---------------------------------------------------------------
export interface AttributionFanoutResult {
  email: { attributed: boolean; emailSendId?: string };
  whatsapp: { attributed: boolean; whatsappSendId?: string };
  sms: { attributed: boolean; smsSendId?: string };
}

/**
 * Mantém a assinatura antiga usada pelos webhooks, mas por baixo faz
 * UMA atribuição — não três em paralelo.
 */
export async function attributeAcrossChannels(
  input: AttributionCallInput
): Promise<AttributionFanoutResult> {
  const r = await attributeOrder(input);
  const vazio = { attributed: false };
  return {
    email: r.channel === 'email' ? { attributed: r.attributed, emailSendId: r.sendId || undefined } : vazio,
    whatsapp: r.channel === 'whatsapp' ? { attributed: r.attributed, whatsappSendId: r.sendId || undefined } : vazio,
    sms: r.channel === 'sms' ? { attributed: r.attributed, smsSendId: r.sendId || undefined } : vazio,
  } as AttributionFanoutResult;
}

export async function revokeAttributionAcrossChannels(
  input: AttributionRevokeInput
): Promise<{ email: boolean; whatsapp: boolean; sms: boolean }> {
  const ok = await revokeOrderAttribution(input);
  return { email: ok, whatsapp: ok, sms: ok };
}
