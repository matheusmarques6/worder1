// =============================================
// Multi-channel attribution orchestrator
//
// One entry point that the Shopify order webhooks call, regardless
// of how many channels are live for the org. Each channel runs its
// own attribution lookup with its own configured window — last-touch
// per channel, identical to how Klaviyo handles cross-channel
// attribution (each channel keeps an independent window, attribution
// goes to whichever message was engaged most recently within its
// channel's window).
//
// The functions here are pure orchestrators: they fan out to the
// channel-specific wrappers (which in turn call the channel-specific
// Postgres RPCs). Failures in one channel never break another;
// Shopify webhook keeps moving even if WhatsApp attribution glitches.
// =============================================

import { attributeEmailConversion } from '@/lib/email/attribution';
import { revokeEmailConversion } from '@/lib/email/attribution';
import { attributeWhatsAppConversion, revokeWhatsAppConversion } from '@/lib/whatsapp/attribution';
import { attributeSmsConversion, revokeSmsConversion } from '@/lib/sms/attribution';

export interface AttributionCallInput {
  contactId: string;
  organizationId: string;
  orderId: string;
  orderValue: number;
}

export interface AttributionRevokeInput {
  organizationId: string;
  orderId: string;
}

export interface AttributionFanoutResult {
  email: { attributed: boolean; emailSendId?: string };
  whatsapp: { attributed: boolean; whatsappSendId?: string };
  sms: { attributed: boolean; smsSendId?: string };
}

/**
 * Run attribution across every channel for an incoming order.
 * Each channel resolves independently — a single order can be
 * attributed to one email AND one WhatsApp message AND one SMS at
 * the same time, scoped per channel. The dashboard then surfaces
 * which channel converted what.
 */
export async function attributeAcrossChannels(
  input: AttributionCallInput
): Promise<AttributionFanoutResult> {
  const [email, whatsapp, sms] = await Promise.all([
    attributeEmailConversion(input).catch((e) => {
      console.error('[Attribution] email failed:', e);
      return { attributed: false } as { attributed: boolean };
    }),
    attributeWhatsAppConversion(input).catch((e) => {
      console.error('[Attribution] whatsapp failed:', e);
      return { attributed: false } as { attributed: boolean };
    }),
    attributeSmsConversion(input).catch((e) => {
      console.error('[Attribution] sms failed:', e);
      return { attributed: false } as { attributed: boolean };
    }),
  ]);

  return { email, whatsapp, sms } as AttributionFanoutResult;
}

/**
 * Reverse attribution across every channel when an order is
 * cancelled / refunded. The channel RPCs are no-ops when nothing was
 * previously attributed, so this is always safe to call.
 */
export async function revokeAttributionAcrossChannels(
  input: AttributionRevokeInput
): Promise<{ email: boolean; whatsapp: boolean; sms: boolean }> {
  const [email, whatsapp, sms] = await Promise.all([
    revokeEmailConversion(input).catch((e) => {
      console.error('[Attribution Revoke] email failed:', e);
      return false;
    }),
    revokeWhatsAppConversion(input).catch((e) => {
      console.error('[Attribution Revoke] whatsapp failed:', e);
      return false;
    }),
    revokeSmsConversion(input).catch((e) => {
      console.error('[Attribution Revoke] sms failed:', e);
      return false;
    }),
  ]);
  return { email, whatsapp, sms };
}
