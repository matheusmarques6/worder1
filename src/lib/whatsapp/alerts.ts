import { supabaseAdmin } from '@/lib/supabase-admin';
import { wlog } from '@/lib/observability/whatsapp-logger';

export interface AlertParams {
  severity: 'info' | 'warning' | 'critical';
  type: 'quality_drop' | 'frequency_cap' | 'template_rejected' | 'template_paused' | 'template_disabled' | 'account_restricted' | 'webhook_dead' | 'window_expiry_bulk' | 'low_messaging_limit' | 'campaign_worker_stalled';
  title: string;
  message: string;
  metadata?: Record<string, any>;
  organizationId?: string;
  wabaId?: string;
  /** Quando presente, usado diretamente como dedup_key (precedência sobre o cálculo wabaId/organizationId). */
  dedupKey?: string;
}

export async function sendAlert(params: AlertParams): Promise<void> {
  const { severity, type, title, message, metadata, organizationId, wabaId, dedupKey: explicitDedupKey } = params;

  // Structured event emission via wlog (Datadog/Loki friendly).
  const logFields = {
    alert_type: type,
    severity,
    title,
    message,
    metadata,
    organization_id: organizationId,
    waba_id: wabaId,
  };
  if (severity === 'critical') wlog.error('whatsapp.alert.emitted', logFields);
  else if (severity === 'warning') wlog.warn('whatsapp.alert.emitted', logFields);
  else wlog.info('whatsapp.alert.emitted', logFields);

  // 2. Insert into whatsapp_alerts with dedup_key (UNIQUE partial index suppresses duplicates).
  // explicitDedupKey takes precedence over the calculated wabaId/organizationId key.
  const dedupKey = explicitDedupKey ?? (wabaId ? `${type}:${wabaId}` : organizationId ? `${type}:${organizationId}` : null);

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
      wlog.warn('whatsapp.alert.persist_insert_failed', { error: result.error.message });
    }
  } catch (e: any) {
    wlog.warn('whatsapp.alert.persist_failed', { error: e?.message });
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
      wlog.warn('whatsapp.alert.slack_failed', { error: e?.message });
    }
  }
}

/**
 * C3: quality_rating muda em horas, messaging_limit em dias. Antes uma unica
 * funcao varria os dois loops a cada 30min — desperdicio. Split em 2:
 *   - checkAndAlertQualityRating()  → cron 30min (responde rapido a RED/YELLOW)
 *   - checkAndAlertMessagingLimits() → cron diario
 *
 * Wrapper de compat (checkAndAlertQualityIssues) ainda existe pra nao quebrar
 * caller, mas as duas crons ja foram separadas.
 */
export async function checkAndAlertQualityRating(): Promise<{
  checked: number;
  alerts_sent: number;
  errors: string[];
}> {
  let checked = 0;
  let alertsSent = 0;
  const errors: string[] = [];

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

      // D6: ao detectar RED, auto-pausa qualquer campanha 'running' dessa
      // org+WABA. Evita esperar o proximo batch pular — corta sangria ja.
      const { error: pauseErr, count } = await supabaseAdmin
        .from('whatsapp_campaigns')
        .update({ status: 'paused', paused_at: new Date().toISOString() }, { count: 'exact' })
        .eq('organization_id', account.organization_id)
        .eq('status', 'running');
      if (pauseErr) {
        wlog.warn('whatsapp.alert.auto_pause_failed', {
          error: pauseErr.message,
          organization_id: account.organization_id,
          waba_id: account.id,
        });
      } else if (count && count > 0) {
        wlog.warn('whatsapp.campaign.auto_paused_red_quality', {
          organization_id: account.organization_id,
          waba_id: account.id,
          paused_count: count,
        });
      }
    }

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

  return { checked, alerts_sent: alertsSent, errors };
}

export async function checkAndAlertMessagingLimits(): Promise<{
  checked: number;
  alerts_sent: number;
  errors: string[];
}> {
  let checked = 0;
  let alertsSent = 0;
  const errors: string[] = [];

  const { data: accounts, error } = await supabaseAdmin
    .from('whatsapp_business_accounts')
    .select('id, waba_id, phone_number_id, display_phone_number, verified_name, messaging_limit, organization_id');

  if (error) {
    errors.push(`Failed to fetch accounts: ${error.message}`);
    return { checked: 0, alerts_sent: 0, errors };
  }

  if (!accounts || accounts.length === 0) {
    return { checked: 0, alerts_sent: 0, errors };
  }

  for (const account of accounts) {
    checked++;
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

/**
 * @deprecated mantido pra compat com callers existentes; use
 * checkAndAlertQualityRating + checkAndAlertMessagingLimits diretamente.
 */
export async function checkAndAlertQualityIssues(): Promise<{
  checked: number;
  alerts_sent: number;
  errors: string[];
}> {
  const a = await checkAndAlertQualityRating();
  const b = await checkAndAlertMessagingLimits();
  return {
    checked: Math.max(a.checked, b.checked),
    alerts_sent: a.alerts_sent + b.alerts_sent,
    errors: [...a.errors, ...b.errors],
  };
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
