// =============================================
// Email Conversion Attribution
// /src/lib/email/attribution.ts
//
// When a Shopify order lands for a contact who recently received
// (and opened/clicked) an email from us, we attribute that order's
// revenue to the last-touched email + campaign. Window defaults to
// 5 days but is configurable per-org via email_settings.attribution.
// =============================================

import { supabaseAdmin } from '@/lib/supabase-admin';

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
    // 1. Fetch the configured attribution window for this org
    //    (defaults to 5 days if not set).
    let windowDays = 5;
    try {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('email_settings')
        .eq('id', organizationId)
        .single();
      const configured = org?.email_settings?.attribution?.email_window_days;
      if (configured && Number.isFinite(Number(configured))) {
        windowDays = Number(configured);
      }
    } catch { /* fall through to default */ }

    // 2. Call the atomic RPC (returns the email_send id that got the
    //    attribution, or NULL if nothing qualified in the window).
    const { data: emailSendId, error } = await supabaseAdmin.rpc(
      'attribute_email_conversion',
      {
        p_contact_id: contactId,
        p_organization_id: organizationId,
        p_order_id: orderId,
        p_order_value: orderValue,
        p_attribution_window_days: windowDays,
      }
    );

    if (error || !emailSendId) {
      return { attributed: false };
    }

    // 3. Fetch campaign_id for the return payload (the RPC already
    //    updated the row + rolled revenue into email_campaigns).
    const { data: send } = await supabaseAdmin
      .from('email_sends')
      .select('campaign_id')
      .eq('id', emailSendId)
      .single();

    console.log(
      `[Attribution] Order ${orderId} (R$ ${orderValue}) attributed to email_send ${emailSendId} (campaign ${send?.campaign_id ?? '—'})`
    );

    return {
      attributed: true,
      emailSendId,
      campaignId: send?.campaign_id ?? undefined,
    };
  } catch (err) {
    console.error('[Attribution] Error:', err);
    return { attributed: false };
  }
}
