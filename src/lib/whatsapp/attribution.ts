// =============================================
// WhatsApp Conversion Attribution
//
// Mirrors email/attribution.ts but reads from whatsapp_sends and
// uses WhatsApp's per-org window (default 2 days because chat
// channels convert faster than email). Engagement signal for
// WhatsApp = delivered / read / replied (Meta sends a status update
// when each happens), so the RPC last-touch lookup uses those
// timestamps instead of opens/clicks.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

interface OrgAttributionSettings {
  whatsapp_window_days: number;
}

const DEFAULTS: OrgAttributionSettings = {
  whatsapp_window_days: 2,
};

async function loadOrgSettings(organizationId: string): Promise<OrgAttributionSettings> {
  try {
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('email_settings')
      .eq('id', organizationId)
      .single();
    const a = org?.email_settings?.attribution || {};
    return {
      whatsapp_window_days: Number(a.whatsapp_window_days) || DEFAULTS.whatsapp_window_days,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function attributeWhatsAppConversion({
  contactId,
  organizationId,
  orderId,
  orderValue,
}: {
  contactId: string;
  organizationId: string;
  orderId: string;
  orderValue: number;
}): Promise<{ attributed: boolean; whatsappSendId?: string; campaignId?: string }> {
  try {
    const settings = await loadOrgSettings(organizationId);

    const { data: sendId, error } = await supabaseAdmin.rpc(
      'attribute_whatsapp_conversion',
      {
        p_contact_id: contactId,
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_order_value: orderValue,
        p_attribution_window_days: settings.whatsapp_window_days,
      }
    );

    if (error || !sendId) {
      return { attributed: false };
    }

    const { data: send } = await supabaseAdmin
      .from('whatsapp_sends')
      .select('campaign_id')
      .eq('id', sendId)
      .single();

    console.log(
      `[Attribution/whatsapp] Order ${orderId} (R$ ${orderValue}) → send ${sendId} (campaign ${send?.campaign_id ?? '—'})`
    );

    return { attributed: true, whatsappSendId: sendId, campaignId: send?.campaign_id ?? undefined };
  } catch (err) {
    console.error('[Attribution/whatsapp] Error:', err);
    return { attributed: false };
  }
}

export async function revokeWhatsAppConversion({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('revoke_whatsapp_conversion', {
      p_organization_id: organizationId,
      p_order_id: orderId,
    });
    if (error) {
      console.error('[Attribution/whatsapp] Revoke error:', error);
      return false;
    }
    if (data) {
      console.log(`[Attribution/whatsapp] Revoked order ${orderId}`);
    }
    return !!data;
  } catch (err) {
    console.error('[Attribution/whatsapp] Revoke exception:', err);
    return false;
  }
}
