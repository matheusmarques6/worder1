// =============================================
// WORDER: Open Pixel Tracker
// /src/app/api/t/o/[id]/route.ts
//
// Returns 1x1 transparent GIF, records open.
// =============================================

import { NextRequest, NextResponse } from 'next/server';

// 1x1 transparent GIF
const TRANSPARENT_GIF = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
  'base64'
);

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const emailSendId = params.id;

  // Record open asynchronously - don't block the response
  try {
    const { isSupabaseConfigured } = await import('@/lib/supabase-admin');

    if (isSupabaseConfigured()) {
      const { supabaseAdmin } = await import('@/lib/supabase-admin');

      await supabaseAdmin
        .from('email_sends')
        .update({ opened_at: new Date().toISOString() })
        .eq('id', emailSendId)
        .is('opened_at', null); // Only update first open
    }
  } catch (error) {
    console.error('[OpenPixel] Error recording open:', error);
  }

  return new NextResponse(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
