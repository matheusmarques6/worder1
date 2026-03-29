import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;

  try {
    const supabase = getSupabaseClient();
    if (supabase && emailSendId) {
      // Find the contact from the email send
      const { data: emailSend } = await supabase
        .from('email_sends')
        .select('contact_id, organization_id, email')
        .eq('id', emailSendId)
        .single();

      if (emailSend?.contact_id) {
        await supabase
          .from('contacts')
          .update({ email_consent: 'unsubscribed', updated_at: new Date().toISOString() })
          .eq('id', emailSend.contact_id);

        await supabase
          .from('email_sends')
          .update({ unsubscribed_at: new Date().toISOString() })
          .eq('id', emailSendId);
      }
    }
  } catch (e) {
    console.error('[Unsubscribe] Error:', e);
  }

  const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Descadastrado</title><style>body{font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#f9fafb;color:#111827}.card{background:white;border:1px solid #e5e7eb;border-radius:16px;padding:48px;text-align:center;max-width:400px;box-shadow:0 1px 3px rgba(0,0,0,.1)}h1{font-size:20px;margin:0 0 8px}p{color:#6b7280;font-size:14px;margin:0}.check{width:48px;height:48px;background:#dcfce7;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}</style></head><body><div class="card"><div class="check">✓</div><h1>Descadastrado com sucesso</h1><p>Você não receberá mais emails desta lista.</p></div></body></html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
