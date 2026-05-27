import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AlertParams {
  severity: 'info' | 'warning' | 'critical';
  type: 'quality_drop' | 'frequency_cap' | 'template_rejected' | 'template_paused' | 'template_disabled' | 'account_restricted' | 'webhook_dead' | 'window_expiry_bulk' | 'low_messaging_limit';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  organizationId?: string;
  wabaId?: string;
}

export async function sendAlert(params: AlertParams): Promise<void> {
  const { severity, type, title, message, metadata, organizationId, wabaId } = params;

  // 1. Always log to structured console output
  const logPayload = {
    type: 'whatsapp_alert',
    alert_type: type,
    severity,
    title,
    message,
    metadata,
    organization_id: organizationId,
    waba_id: wabaId,
    timestamp: new Date().toISOString(),
  };

  if (severity === 'critical') {
    console.error('[ALERT]', JSON.stringify(logPayload));
  } else if (severity === 'warning') {
    console.warn('[ALERT]', JSON.stringify(logPayload));
  } else {
    console.log('[ALERT]', JSON.stringify(logPayload));
  }

  // 2. Insert into whatsapp_alerts with dedup_key (UNIQUE partial index suppresses duplicates)
  const dedupKey = wabaId ? `${type}:${wabaId}` : organizationId ? `${type}:${organizationId}` : null;

  try {
    const result = await supabaseAdmin.from('whatsapp_alerts').insert({
      type,
      title,
      body: message,
      severity,
      metadata: metadata || {},
      organization_id: organizationId || null,
      waba_id: wabaId || null,
      dedup_key: dedupKey,
    });

    if (result.error && result.error.code === '23505') {
      return;
    }
    if (result.error) {
      console.warn('[alerts] insert failed:', result.error.message);
    }
  } catch (e: any) {
    console.warn('[alerts] persist failed:', e.message);
  }

  // 4. Slack webhook (if configured)
  const slackUrl = process.env.SLACK_WEBHOOK_URL;
  if (slackUrl) {
    try {
      const emoji = severity === 'critical' ? ':rotating_light:' : severity === 'warning' ? ':warning:' : ':information_source:';
      await fetch(slackUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `${emoji} *${title}*\n${message}`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${emoji} *${title}*\n${message}`,
              },
            },
            ...(metadata
              ? [
                  {
                    type: 'context',
                    elements: [
                      {
                        type: 'mrkdwn',
                        text: Object.entries(metadata)
                          .map(([k, v]) => `*${k}:* ${v}`)
                          .join(' | '),
                      },
                    ],
                  },
                ]
              : []),
          ],
        }),
      });
    } catch (e: any) {
      console.warn('[ALERT] Slack webhook failed:', e.message);
    }
  }
}

export async function checkAndAlertQualityIssues(): Promise<{
  checked: number;
  alerts_sent: number;
  errors: string[];
}> {
  let checked = 0;
  let alertsSent = 0;
  const errors: string[] = [];

  // Fetch all WABA accounts
  const { data: accounts, error } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('id, waba_id, phone_number_id, display_phone_number, verified_name, quality_rating, messaging_limit, organization_id, status');

  if (error) {
    errors.push(`Failed to fetch accounts: ${error.message}`);
    return { checked: 0, alerts_sent: 0, errors };
  }

  if (!accounts || accounts.length === 0) {
    return { checked: 0, alerts_sent: 0, errors };
  }

  for (const account of accounts) {
    checked++;

    // Alert on RED quality
    if (account.quality_rating === 'RED') {
      await sendAlert({
        severity: 'critical',
        type: 'quality_drop',
        title: 'WhatsApp Quality Rating RED',
        message: `Account ${account.verified_name || account.display_phone_number} (${account.phone_number_id}) has RED quality rating. Immediate action required to avoid restrictions.`,
        metadata: {
          waba_id: account.waba_id,
          phone_number_id: account.phone_number_id,
          messaging_limit: account.messaging_limit,
        },
        organizationId: account.organization_id,
        wabaId: account.id,
      });
      alertsSent++;
    }

    // Alert on YELLOW quality
    if (account.quality_rating === 'YELLOW') {
      await sendAlert({
        severity: 'warning',
        type: 'quality_drop',
        title: 'WhatsApp Quality Rating YELLOW',
        message: `Account ${account.verified_name || account.display_phone_number} (${account.phone_number_id}) has YELLOW quality rating. Review message content and frequency.`,
        metadata: {
          waba_id: account.waba_id,
          phone_number_id: account.phone_number_id,
          messaging_limit: account.messaging_limit,
        },
        organizationId: account.organization_id,
        wabaId: account.id,
      });
      alertsSent++;
    }
  }

  for (const account of accounts) {
    if (account.messaging_limit === 'TIER_250' || account.messaging_limit === 'TIER_1K') {
      await sendAlert({
        severity: 'info',
        type: 'low_messaging_limit',
        title: 'Low Messaging Limit',
        message: `Account ${account.verified_name || account.display_phone_number} is at ${account.messaging_limit}. Consider warming up to TIER_10K+.`,
        metadata: {
          waba_id: account.waba_id,
          phone_number_id: account.phone_number_id,
          messaging_limit: account.messaging_limit,
        },
        organizationId: account.organization_id,
        wabaId: account.id,
      });
      alertsSent++;
    }
  }

  return { checked, alerts_sent: alertsSent, errors };
}

export async function checkFrequencyCapRate(organizationId: string): Promise<{
  rate: number;
  capped_count: number;
  total_count: number;
  alert_sent: boolean;
}> {
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Count total outbound messages in the last 24h
  const { count: totalCount } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .gte('timestamp', oneDayAgo);

  const { count: cappedCount } = await supabaseAdmin
    .from('whatsapp_cloud_messages')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', organizationId)
    .eq('direction', 'outbound')
    .eq('status', 'failed')
    .eq('error_code', '131049')
    .gte('timestamp', oneDayAgo);

  const total = totalCount || 0;
  const capped = cappedCount || 0;
  const rate = total > 0 ? capped / total : 0;

  let alertSent = false;

  // Alert if more than 5% of messages are being frequency-capped
  if (rate > 0.05 && total >= 100) {
    await sendAlert({
      severity: 'warning',
      type: 'frequency_cap',
      title: 'High Frequency Cap Rate',
      message: `Organization has ${(rate * 100).toFixed(1)}% frequency cap rate (${capped}/${total} messages in 24h). Consider reducing send frequency.`,
      metadata: {
        organization_id: organizationId,
        rate: `${(rate * 100).toFixed(1)}%`,
        capped_count: capped,
        total_count: total,
      },
      organizationId,
    });
    alertSent = true;
  }

  return { rate, capped_count: capped, total_count: total, alert_sent: alertSent };
}
