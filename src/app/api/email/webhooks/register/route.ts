// =============================================
// Resend webhook registration endpoint
// GET  /api/email/webhooks/register — lists currently registered webhooks
// POST /api/email/webhooks/register — registers ours if missing
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { registerWebhook, listWebhooks } from '@/lib/email/resend';

export const dynamic = 'force-dynamic';

export async function GET() {
  const auth = await getAuthClient();
  if (!auth) return authError();
  try {
    const webhooks = await listWebhooks();
    return NextResponse.json({ webhooks });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(_request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://worder1.vercel.app';
    const webhookUrl = `${baseUrl}/api/webhooks/resend`;

    // Check if already registered. A API atual expõe o destino como
    // `endpoint`; versões antigas usavam `url` — aceitar os dois, senão
    // cada POST criava um webhook duplicado na conta.
    const existing: any = await listWebhooks();
    const alreadyExists = existing?.data?.some(
      (wh: any) => wh.endpoint === webhookUrl || wh.url === webhookUrl
    );
    if (alreadyExists) {
      return NextResponse.json({
        message: 'Webhook already registered',
        url: webhookUrl,
        reminder:
          'Confirme que RESEND_WEBHOOK_SECRET (signing secret do webhook, em Resend → Webhooks) está setado na Vercel — sem ele o handler rejeita todo evento com 401.',
      });
    }

    const webhook = await registerWebhook(webhookUrl);
    // O signing secret só é entregue na criação (ou no painel da Resend).
    // Sem ele em RESEND_WEBHOOK_SECRET o handler fail-closed rejeita tudo
    // — foi assim que a conta ficou meses com delivered/opened/clicked
    // zerados. Devolver o secret aqui para o operador copiar pro env.
    const signingSecret =
      (webhook as any)?.signing_secret || (webhook as any)?.secret || null;
    return NextResponse.json(
      {
        webhook,
        url: webhookUrl,
        signingSecret,
        next: signingSecret
          ? 'Copie signingSecret para a env RESEND_WEBHOOK_SECRET na Vercel e faça redeploy.'
          : 'Copie o signing secret deste webhook no painel da Resend (Webhooks → seu endpoint) para a env RESEND_WEBHOOK_SECRET na Vercel e faça redeploy.',
      },
      { status: 201 }
    );
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
