// =============================================
// SMS Conversion Attribution
//
// Same shape as email/whatsapp. SMS doesn't have an "open" pixel
// (no images, no tracking pixel), so engagement = delivered or
// clicked (links in SMS that go through Worder's click tracker).
// Default window is 2 days — Klaviyo uses 5, Omnisend uses 24h, our
// default sits between because Brazilian SMS conversions usually
// happen within the first 48h.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

interface OrgAttributionSettings {
  sms_window_days: number;
}

const DEFAULTS: OrgAttributionSettings = {
  sms_window_days: 2,
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
      sms_window_days: Number(a.sms_window_days) || DEFAULTS.sms_window_days,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function attributeSmsConversion({
  contactId,
  organizationId,
  orderId,
  orderValue,
}: {
  contactId: string;
  organizationId: string;
  orderId: string;
  orderValue: number;
}): Promise<{ attributed: boolean; smsSendId?: string; campaignId?: string }> {
  try {
    const settings = await loadOrgSettings(organizationId);

    const { data: sendId, error } = await supabaseAdmin.rpc(
      'attribute_sms_conversion',
      {
        p_contact_id: contactId,
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_order_value: orderValue,
        p_attribution_window_days: settings.sms_window_days,
      }
    );

    if (error || !sendId) {
      return { attributed: false };
    }

    const { data: send } = await supabaseAdmin
      .from('sms_sends')
      .select('campaign_id')
      .eq('id', sendId)
      .single();

    console.log(
      `[Attribution/sms] Order ${orderId} (R$ ${orderValue}) → send ${sendId} (campaign ${send?.campaign_id ?? '—'})`
    );

    return { attributed: true, smsSendId: sendId, campaignId: send?.campaign_id ?? undefined };
  } catch (err) {
    console.error('[Attribution/sms] Error:', err);
    return { attributed: false };
  }
}

export async function revokeSmsConversion({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('revoke_sms_conversion', {
      p_organization_id: organizationId,
      p_order_id: orderId,
    });
    if (error) {
      console.error('[Attribution/sms] Revoke error:', error);
      return false;
    }
    if (data) {
      console.log(`[Attribution/sms] Revoked order ${orderId}`);
    }
    return !!data;
  } catch (err) {
    console.error('[Attribution/sms] Revoke exception:', err);
    return false;
  }
}
