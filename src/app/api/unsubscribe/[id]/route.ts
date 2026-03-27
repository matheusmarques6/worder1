import { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  let unsubscribed = false

  try {
    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')

      // Get email_send to find contact
      const { data: emailSend } = await supabaseAdmin
        .from('email_sends')
        .select('contact_id, organization_id')
        .eq('id', params.id)
        .single()

      if (emailSend?.contact_id) {
        // Update contact's email subscription
        await supabaseAdmin
          .from('contacts')
          .update({ is_subscribed_email: false })
          .eq('id', emailSend.contact_id)

        // Mark the email send as unsubscribed
        await supabaseAdmin
          .from('email_sends')
          .update({
            unsubscribed_at: new Date().toISOString(),
            status: 'unsubscribed',
          })
          .eq('id', params.id)

        unsubscribed = true
      }
    }
  } catch (err) {
    console.error('[Unsubscribe] Error:', err)
  }

  const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cancelar Inscrição</title>
  <style>
    body { font-family: 'DM Sans', system-ui, sans-serif; background: #f9fafb; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: white; border: 1px solid #e5e7eb; border-radius: 12px; padding: 48px; max-width: 480px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
    h1 { color: #111827; font-size: 24px; margin: 0 0 12px; }
    p { color: #6b7280; font-size: 14px; line-height: 1.6; margin: 0; }
    .icon { font-size: 48px; margin-bottom: 16px; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">${unsubscribed ? '✅' : '⚠️'}</div>
    <h1>${unsubscribed ? 'Inscrição Cancelada' : 'Erro ao Processar'}</h1>
    <p>${unsubscribed
      ? 'Você foi removido da nossa lista de emails. Não receberá mais comunicações por email.'
      : 'Não foi possível processar sua solicitação. Tente novamente mais tarde.'}</p>
  </div>
</body>
</html>`

  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}
