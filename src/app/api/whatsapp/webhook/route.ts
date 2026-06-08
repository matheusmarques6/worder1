// =============================================
// API: /api/whatsapp/webhook (DEPRECATED — forwarder)
// =============================================
// Antes processava payloads da Evolution API (não-oficial) inline e
// gravava nas tabelas legadas (whatsapp_conversations / whatsapp_messages).
// A Evolution foi removida: este endpoint agora apenas encaminha GET e POST,
// verbatim, para /api/whatsapp/cloud/webhook — a rota canônica do WhatsApp
// Cloud (Meta): async/QStash, HMAC fail-closed, grava em whatsapp_cloud_*.
//
// Mantido vivo só para que qualquer config do Meta Business Suite que ainda
// aponte para esta URL continue funcionando até o usuário atualizar o painel.
// Pode ser removido quando a telemetria confirmar zero hits.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

function buildForwardUrl(request: NextRequest): URL {
  const target = new URL('/api/whatsapp/cloud/webhook', request.url);
  // Preserva a query string verbatim (hub.mode, hub.verify_token, hub.challenge, …)
  request.nextUrl.searchParams.forEach((value, key) => {
    target.searchParams.set(key, value);
  });
  return target;
}

// GET — challenge de verificação do Meta. Encaminha a query para /cloud/webhook
// e devolve a resposta verbatim (inclui o lookup de verify token por conta).
export async function GET(request: NextRequest) {
  console.warn('[DEPRECATED] /api/whatsapp/webhook GET hit — forwarding to /cloud/webhook');

  const target = buildForwardUrl(request);
  const upstream = await fetch(target, {
    method: 'GET',
    headers: request.headers,
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'text/plain' },
  });
}

// POST — encaminha corpo cru + headers (o header de assinatura é preservado).
// O cloud webhook revalida o HMAC contra os bytes crus, então a integridade da
// assinatura é mantida desde que o corpo não seja mutado.
export async function POST(request: NextRequest) {
  console.warn('[DEPRECATED] /api/whatsapp/webhook POST hit — forwarding to /cloud/webhook');

  const rawBody = await request.text();
  const target = buildForwardUrl(request);

  const upstream = await fetch(target, {
    method: 'POST',
    headers: request.headers,
    body: rawBody,
  });

  const body = await upstream.text();
  return new NextResponse(body, {
    status: upstream.status,
    headers: { 'content-type': upstream.headers.get('content-type') || 'application/json' },
  });
}
