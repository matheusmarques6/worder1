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

    // Check if already registered
    const existing: any = await listWebhooks();
    const alreadyExists = existing?.data?.some((wh: any) => wh.url === webhookUrl);
    if (alreadyExists) {
      return NextResponse.json({ message: 'Webhook already registered', url: webhookUrl });
    }

    const webhook = await registerWebhook(webhookUrl);
    return NextResponse.json({ webhook, url: webhookUrl }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
