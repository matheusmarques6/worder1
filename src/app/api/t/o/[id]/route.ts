import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

// 1x1 transparent GIF
const PIXEL = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;

  try {
    const supabase = getSupabaseClient();
    if (supabase && emailSendId) {
      // Update opened_at only if not already set
      await supabase
        .from('email_sends')
        .update({
          opened_at: new Date().toISOString(),
          status: 'opened',
          open_count: 1, // Will be incremented by trigger if needed
        })
        .eq('id', emailSendId)
        .is('opened_at', null);

      // Also increment open_count for repeat opens
      try {
        await (supabase as any).rpc('increment_open_count', { send_id: emailSendId });
      } catch {
        // RPC may not exist, that's ok
      }
    }
  } catch (e) {
    console.error('[Track/Open] Error:', e);
  }

  return new NextResponse(PIXEL, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Pragma': 'no-cache',
    },
  });
}
