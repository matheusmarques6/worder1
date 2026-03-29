// =============================================
// WORDER: Unsubscribe Handler
// /src/app/api/unsubscribe/[id]/route.ts
//
// Marks contact as unsubscribed, shows PT-BR page.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;
  let success = false;

  try {
    const { isSupabaseConfigured } = await import('@/lib/supabase-admin');

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin');

      // Get the contact_id from email_sends
      const { data: emailSend } = await supabaseAdmin
        .from('email_sends')
        .select('contact_id')
        .eq('id', emailSendId)
        .single();

      if (emailSend?.contact_id) {
        // Mark contact as unsubscribed
        const { error } = await supabaseAdmin
          .from('contacts')
          .update({ is_subscribed_email: false })
          .eq('id', emailSend.contact_id);

        if (!error) {
          success = true;
        } else {
          console.error('[Unsubscribe] Error updating contact:', error);
        }

        // Also record unsubscribe on email_sends
        await supabaseAdmin
          .from('email_sends')
          .update({ unsubscribed_at: new Date().toISOString() })
          .eq('id', emailSendId);
      }
    }
  } catch (error) {
    console.error('[Unsubscribe] Error:', error);
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cancelar Inscrição</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      margin: 0;
      background-color: #f5f5f5;
      color: #333;
    }
    .container {
      text-align: center;
      padding: 40px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      max-width: 480px;
    }
    .icon { font-size: 48px; margin-bottom: 16px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { font-size: 16px; color: #666; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="container">
    ${
      success
        ? `<div class="icon">✓</div>
           <h1>Inscrição cancelada</h1>
           <p>Você foi removido da nossa lista de e-mails com sucesso.<br>
           Não receberá mais e-mails de marketing.</p>`
        : `<div class="icon">⚠</div>
           <h1>Erro ao cancelar inscrição</h1>
           <p>Não foi possível processar seu pedido de cancelamento.<br>
           Por favor, tente novamente mais tarde ou entre em contato conosco.</p>`
    }
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
