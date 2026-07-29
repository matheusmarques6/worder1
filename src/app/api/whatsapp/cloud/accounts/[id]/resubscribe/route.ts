// =============================================
// API: POST /api/whatsapp/cloud/accounts/[id]/resubscribe
//
// Re-inscreve o app nos webhooks do WABA (POST /{waba_id}/subscribed_apps
// com subscribed_fields explicito) e RELE a inscricao para confirmar que ela
// realmente ficou de pe — um 200 da Meta no POST nao e prova suficiente.
//
// Existe porque a inscricao cai sozinha e o unico caminho que a recriava era
// reconectar a conta inteira (/whatsapp/connect ou embedded signup), o que
// exige gerar um token novo. Aqui reaproveitamos o token ja armazenado.
//
// Sintoma que isso resolve: envio funciona, mas nada entra — nem mensagem do
// cliente, nem recibo de entrega (as mensagens travam em "enviada", nunca
// chegam a "entregue").
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireOrgFromAuth } from '@/lib/auth/require-org';
import { getAccessToken } from '@/lib/whatsapp/account-loader';
import {
  deriveWebhookSubscription,
  getWABASubscribedApps,
  subscribeAppToWABA,
} from '@/lib/whatsapp/cloud-api';
import { wlog } from '@/lib/observability/whatsapp-logger';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> | { id: string } },
) {
  try {
    const resolved = await Promise.resolve(params as Promise<{ id: string }>);
    const accountId = resolved.id;

    const auth = await requireOrgFromAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { orgId } = auth;

    const { data: account, error: accountError } = await supabaseAdmin
      .from('whatsapp_business_accounts')
      .select('*')
      .eq('id', accountId)
      .eq('organization_id', orgId)
      .maybeSingle();

    if (accountError) {
      console.error('[accounts/resubscribe] DB error:', accountError);
      return NextResponse.json({ error: 'Database error' }, { status: 500 });
    }
    if (!account) {
      return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    }
    if (!account.waba_id) {
      return NextResponse.json(
        {
          error: 'Conta sem waba_id',
          details:
            'Reconecte o numero para que o WABA ID seja detectado — sem ele nao da para inscrever o webhook.',
        },
        { status: 400 },
      );
    }

    let token: string;
    try {
      token = getAccessToken(account);
    } catch (e: any) {
      return NextResponse.json(
        { error: 'Sem access token', details: e?.message },
        { status: 400 },
      );
    }

    try {
      await subscribeAppToWABA({ wabaId: account.waba_id, accessToken: token });
    } catch (e: any) {
      wlog.error('whatsapp.webhook.resubscribe_failed', {
        account_id: account.id,
        organization_id: orgId,
        waba_id: account.waba_id,
        error: e?.message,
      });
      // 190 = token; 200/100 = permissao. O scope de management e o que falta
      // com mais frequencia, e o erro cru da Meta nao diz isso.
      return NextResponse.json(
        {
          error: 'Falha ao reinscrever',
          details: e?.message || 'Erro desconhecido da Meta',
          hint: 'O token precisa do scope whatsapp_business_management. Gere um System User Token com whatsapp_business_messaging E whatsapp_business_management.',
        },
        { status: 400 },
      );
    }

    // Confirmacao: rele o estado real em vez de confiar no 200 do POST.
    let webhook;
    let webhookError: string | undefined;
    try {
      const raw = await getWABASubscribedApps({
        wabaId: account.waba_id,
        accessToken: token,
      });
      webhook = deriveWebhookSubscription(raw, process.env.META_APP_ID);
    } catch (e: any) {
      webhookError = e?.message || 'Falha ao confirmar a inscricao';
    }

    if (typeof webhook?.subscribed === 'boolean') {
      await supabaseAdmin
        .from('whatsapp_business_accounts')
        .update({ webhook_configured: webhook.subscribed })
        .eq('id', account.id);
    }

    wlog.info('whatsapp.webhook.resubscribed', {
      account_id: account.id,
      organization_id: orgId,
      waba_id: account.waba_id,
      subscribed: webhook?.subscribed ?? null,
      app_count: webhook?.appCount ?? null,
    });

    return NextResponse.json({ success: true, webhook, webhookError });
  } catch (e: any) {
    console.error('[accounts/resubscribe] unhandled:', e);
    return NextResponse.json(
      { error: 'Internal server error', details: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
