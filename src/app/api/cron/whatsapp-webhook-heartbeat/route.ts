import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendAlert } from '@/lib/whatsapp/alerts';
import { wlog } from '@/lib/observability/whatsapp-logger';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

// Onda 13 / P1-2 — watchdog da subscription de webhook da Meta.
//
// Caso real que motivou: a subscription da InnovaBay morreu em 30/05 e
// ficou 12 DIAS silenciosa — nenhuma mensagem entrava, ninguem sabia.
// last_webhook_at e atualizado a cada evento processado; se uma conta
// ativa fica > 2h sem nenhum webhook, alertamos. Dedup do sendAlert
// (type:wabaId) evita spam a cada rodada do cron.
//
// COALESCE(last_webhook_at, created_at): conta recem-conectada que nunca
// recebeu webhook tambem alarma apos 2h — falha de setup e o caso mais
// comum de "conectei mas nao chega nada".

const STALE_THRESHOLD_HOURS = 2;

function authorize(req: NextRequest): boolean {
  if (req.headers.get('x-vercel-cron')) return true;
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const auth = req.headers.get('authorization');
    if (auth === `Bearer ${cronSecret}`) return true;
  }
  return process.env.NODE_ENV !== 'production';
}

export async function GET(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  try {
    const cutoffIso = new Date(
      Date.now() - STALE_THRESHOLD_HOURS * 60 * 60 * 1000,
    ).toISOString();

    const { data: accounts, error } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('id, organization_id, verified_name, display_phone_number, phone_number, phone_number_id, last_webhook_at, created_at')
      .eq('status', 'active');

    if (error) {
      wlog.error('whatsapp.cron.heartbeat_fetch_error', { error: error.message });
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    let checked = 0;
    let stale = 0;

    for (const account of accounts || []) {
      checked++;
      const lastSignal = account.last_webhook_at || account.created_at;
      if (!lastSignal || lastSignal >= cutoffIso) continue;

      stale++;
      const name =
        account.verified_name || account.display_phone_number || account.phone_number;
      const hoursAgo = Math.round(
        (Date.now() - new Date(lastSignal).getTime()) / 3_600_000,
      );

      wlog.error('whatsapp.webhook.heartbeat_stale', {
        account_id: account.id,
        organization_id: account.organization_id,
        phone_number_id: account.phone_number_id,
        last_webhook_at: account.last_webhook_at,
        hours_ago: hoursAgo,
      });

      await sendAlert({
        severity: 'critical',
        type: 'webhook_dead',
        title: 'WhatsApp parou de receber webhooks',
        message: `A conta ${name} não recebe eventos da Meta há ~${hoursAgo}h. Mensagens de clientes NÃO estão chegando. Verifique a subscription do webhook no painel da Meta (ou reconecte a conta).`,
        organizationId: account.organization_id,
        wabaId: account.id,
        metadata: {
          phone_number_id: account.phone_number_id,
          last_webhook_at: account.last_webhook_at,
          hours_ago: hoursAgo,
        },
      });

      // Notificacao no sino — o lojista precisa ver isso sem abrir o Slack.
      const { error: notifErr } = await supabaseAdmin.from('notifications').insert({
        organization_id: account.organization_id,
        type: 'whatsapp_webhook_dead',
        title: 'WhatsApp sem receber mensagens',
        message: `A conta ${name} está há ~${hoursAgo}h sem receber eventos do WhatsApp. Clientes podem estar mandando mensagens que não chegam.`,
        metadata: { account_id: account.id, hours_ago: hoursAgo },
        action_url: '/whatsapp/inbox',
      });
      if (notifErr) {
        wlog.warn('whatsapp.cron.heartbeat_notification_failed', {
          error: notifErr.message,
        });
      }
    }

    return NextResponse.json({ ok: true, checked, stale });
  } catch (error: any) {
    wlog.error('whatsapp.cron.heartbeat_error', { error: error?.message });
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
}
