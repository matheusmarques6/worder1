import { supabaseAdmin } from '@/lib/supabase-admin';

export interface AlertParams {
  severity: 'info' | 'warning' | 'critical';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  organizationId?: string;
}

export async function sendAlert(params: AlertParams): Promise<void> {
  const { severity, title, message, metadata, organizationId } = params;

  // 1. Always log to structured console output
  const logPayload = {
    type: 'whatsapp_alert',
    severity,
    title,
    message,
    metadata,
    organization_id: organizationId,
    timestamp: new Date().toISOString(),
  };

  if (severity === 'critical') {
    console.error('[ALERT]', JSON.stringify(logPayload));
  } else if (severity === 'warning') {
    console.warn('[ALERT]', JSON.stringify(logPayload));
  } else {
    console.log('[ALERT]', JSON.stringify(logPayload));
  }

  // 2. Try inserting into notifications table (graceful if missing)
  try {
    await supabaseAdmin.from('notifications').insert({
      type: 'whatsapp_quality_alert',
      title,
      message,
      severity,
      metadata: metadata || {},
      organization_id: organizationId || null,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Table may not exist yet
  }

  // 3. Slack webhook (if configured)
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
        title: 'WhatsApp Quality Rating RED',
        message: `Account ${account.verified_name || account.display_phone_number} (${account.phone_number_id}) has RED quality rating. Immediate action required to avoid restrictions.`,
        metadata: {
          waba_id: account.waba_id,
          phone_number_id: account.phone_number_id,
          messaging_limit: account.messaging_limit,
        },
        organizationId: account.organization_id,
      });
      alertsSent++;
    }

    // Alert on YELLOW quality
    if (account.quality_rating === 'YELLOW') {
      await sendAlert({
        severity: 'warning',
        title: 'WhatsApp Quality Rating YELLOW',
        message: `Account ${account.verified_name || account.display_phone_number} (${account.phone_number_id}) has YELLOW quality rating. Review message content and frequency.`,
        metadata: {
          waba_id: account.waba_id,
          phone_number_id: account.phone_number_id,
          messaging_limit: account.messaging_limit,
        },
        organizationId: account.organization_id,
      });
      alertsSent++;
    }
  }

  // Check for accounts with very low messaging limits
  const limitedAccounts = accounts.filter(
    (a: any) => a.messaging_limit === 'TIER_250' || a.messaging_limit === 'TIER_1K'
  );

  if (limitedAccounts.length > 0) {
    await sendAlert({
      severity: 'info',
      title: 'Low Messaging Limits Detected',
      message: `${limitedAccounts.length} account(s) have messaging limits at TIER_250 or TIER_1K. Consider warming up these numbers.`,
      metadata: {
        accounts: limitedAccounts.map((a: any) => a.phone_number_id).join(', '),
      },
    });
    alertsSent++;
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
