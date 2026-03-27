import { NextRequest } from 'next/server'
import { isSupabaseConfigured } from '@/lib/supabase-admin'

const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64')

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin')

      // Only update if not already opened
      await supabaseAdmin
        .from('email_sends')
        .update({
          opened_at: new Date().toISOString(),
          status: 'opened',
        })
        .eq('id', params.id)
        .is('opened_at', null)
    }
  } catch (err) {
    console.error('[Tracking] Open pixel error:', err)
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  })
}
