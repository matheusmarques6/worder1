// =============================================
// Email Conversion Attribution
//
// When a Shopify order lands for a contact who recently received
// (and engaged with) an email from us, we attribute that order's
// revenue to the last-touched email + campaign. Window + engagement
// signals are configurable per-org via
// organizations.email_settings.attribution. Defaults mirror Klaviyo
// (5-day window, opens count, Apple MPP opens excluded).
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

interface OrgAttributionSettings {
  email_window_days: number;
  count_opens: boolean;
  exclude_mpp_opens: boolean;
}

const DEFAULTS: OrgAttributionSettings = {
  email_window_days: 5,
  count_opens: true,
  exclude_mpp_opens: true,
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
      email_window_days: Number(a.email_window_days) || DEFAULTS.email_window_days,
      count_opens: a.count_opens !== false,
      exclude_mpp_opens: a.exclude_mpp_opens !== false,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function attributeEmailConversion({
  contactId,
  organizationId,
  orderId,
  orderValue,
}: {
  contactId: string;
  organizationId: string;
  orderId: string;
  orderValue: number;
}): Promise<{ attributed: boolean; emailSendId?: string; campaignId?: string }> {
  try {
    const settings = await loadOrgSettings(organizationId);

    const { data: emailSendId, error } = await supabaseAdmin.rpc(
      'attribute_email_conversion',
      {
        p_contact_id: contactId,
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_order_value: orderValue,
        p_attribution_window_days: settings.email_window_days,
        p_count_opens: settings.count_opens,
        p_exclude_mpp_opens: settings.exclude_mpp_opens,
      }
    );

    if (error || !emailSendId) {
      return { attributed: false };
    }

    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('campaign_id')
      .eq('id', emailSendId)
      .single();

    console.log(
      `[Attribution/email] Order ${orderId} (R$ ${orderValue}) → send ${emailSendId} (campaign ${send?.campaign_id ?? '—'})`
    );

    return { attributed: true, emailSendId, campaignId: send?.campaign_id ?? undefined };
  } catch (err) {
    console.error('[Attribution/email] Error:', err);
    return { attributed: false };
  }
}

export async function revokeEmailConversion({
  organizationId,
  orderId,
}: {
  organizationId: string;
  orderId: string;
}): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin.rpc('revoke_email_conversion', {
      p_organization_id: organizationId,
      p_order_id: orderId,
    });
    if (error) {
      console.error('[Attribution/email] Revoke error:', error);
      return false;
    }
    if (data) {
      console.log(`[Attribution/email] Revoked order ${orderId}`);
    }
    return !!data;
  } catch (err) {
    console.error('[Attribution/email] Revoke exception:', err);
    return false;
  }
}
