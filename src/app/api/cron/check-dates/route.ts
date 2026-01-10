/**
 * CRON: Check Date Events
 * Verifica aniversários e datas especiais diariamente
 * Configurar no Vercel: executar às 00:01 todos os dias
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET(request: NextRequest) {
  // Verificar authorization
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
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
