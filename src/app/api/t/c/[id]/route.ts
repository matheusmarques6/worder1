import { NextRequest, NextResponse } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const url = req.nextUrl.searchParams.get('url')

  if (!url) {
    return NextResponse.redirect(new URL('/', req.url), 302)
  }

  try {
    const decodedUrl = decodeURIComponent(url)

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')

      // Update clicked_at (first click only)
      await supabaseAdmin
        .from('email_sends')
        .update({
          clicked_at: new Date().toISOString(),
          status: 'clicked',
        })
        .eq('id', params.id)
        .is('clicked_at', null)

      // Also track individual click
      // Track individual click (table may not exist yet)
      try {
        await supabaseAdmin
          .from('email_clicks')
          .insert({
            email_send_id: params.id,
            url: decodedUrl,
            clicked_at: new Date().toISOString(),
            user_agent: req.headers.get('user-agent') || null,
          })
      } catch {
        // email_clicks table may not exist
      }
    }

    return NextResponse.redirect(decodedUrl, 302)
  } catch (err) {
    console.error('[Tracking] Click error:', err)
    return NextResponse.redirect(decodeURIComponent(url), 302)
  }
}
