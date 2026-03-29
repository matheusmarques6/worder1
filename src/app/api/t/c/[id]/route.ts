import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  try {
    const supabase = getSupabaseClient();
    if (supabase && emailSendId) {
      await supabase
        .from('email_sends')
        .update({
          clicked_at: new Date().toISOString(),
          status: 'clicked',
        })
        .eq('id', emailSendId)
        .is('clicked_at', null);
    }
  } catch (e) {
    console.error('[Track/Click] Error:', e);
  }

  return NextResponse.redirect(url, 302);
}
