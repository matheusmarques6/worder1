/**
 * CRON: Check Date Events
 * Verifica aniversários e datas especiais diariamente
 * Configurar no Vercel: executar às 00:01 todos os dias
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
export const dynamic = 'force-dynamic';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Vercel Cron sends x-vercel-cron: 1 instead of Bearer auth.
  // Without this branch the daily birthday/anniversary fan-out
  // never fired in production — Vercel hit 401, the cron silently
  // dropped, and merchants saw no birthday emails despite the
  // trigger appearing fully wired.
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const isDev = process.env.NODE_ENV === 'development';
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  // X-Internal-Request was removed: it's client-settable and not stripped
  // by Vercel, so it let any caller spoof authorization. Only Vercel Cron
  // or Bearer CRON_SECRET (or dev) is accepted now.
  const isAuthorized = isVercelCron || isDev ||
    (cronSecret && authHeader === `Bearer ${cronSecret}`);

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // Chamar função SQL que emite eventos de data
    const { data, error } = await supabase.rpc('emit_date_events');

    if (error) {
      console.error('[CRON:DateEvents] Error:', error);
      return NextResponse.json({ 
        success: false, 
        error: error.message 
      }, { status: 500 });
    }

    console.log(`[CRON:DateEvents] Emitted ${data} date events`);

    // Processar eventos criados
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL;
    if (appUrl) {
      // Chamar endpoint de processamento de eventos
      fetch(`${appUrl}/api/cron/process-events`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${cronSecret}`,
        },
      }).catch(err => {
        console.error('[CRON:DateEvents] Error triggering event processing:', err);
      });
    }

    return NextResponse.json({
      success: true,
      eventsEmitted: data,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('[CRON:DateEvents] Exception:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message 
    }, { status: 500 });
  }
}

// Suporte para POST também (alguns providers de cron usam POST)
export async function POST(request: NextRequest) {
  return GET(request);
}
