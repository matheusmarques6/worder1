// =============================================
// WORDER: Click Tracker / Redirect
// /src/app/api/t/c/[id]/route.ts
//
// Records click, logs to email_clicks, redirects.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;
  const url = request.nextUrl.searchParams.get('url');

  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  const decodedUrl = decodeURIComponent(url);

  // Record click asynchronously
  try {
    const { isSupabaseConfigured } = await import('@/lib/supabase-admin');

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin');

      // Update first click timestamp on email_sends
      await supabaseAdmin
        .from('email_sends')
        .update({ clicked_at: new Date().toISOString() })
        .eq('id', emailSendId)
        .is('clicked_at', null);

      // Log individual click to email_clicks
      try {
        await supabaseAdmin.from('email_clicks').insert({
          email_send_id: emailSendId,
          url: decodedUrl,
          clicked_at: new Date().toISOString(),
        });
      } catch (clickError) {
        // email_clicks table might not exist yet
        console.error('[ClickTracker] Error logging click:', clickError);
      }
    }
  } catch (error) {
    console.error('[ClickTracker] Error recording click:', error);
  }

  // 302 redirect to the original URL
  return NextResponse.redirect(decodedUrl, 302);
}
