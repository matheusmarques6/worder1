// =============================================
// API: Teste de Webhook - SIMPLES
// src/app/api/webhooks/shopify/test/route.ts
// 
// Use para testar se webhooks estão chegando
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';

function getSupabase() {
  return getSupabaseAdmin();
}

// POST - Simular webhook (para teste manual)
export async function POST(request: NextRequest) {
  const timestamp = new Date().toISOString();
  
  try {
    const bodyText = await request.text();
    let body: any = {};
    try {
      body = JSON.parse(bodyText);
    } catch {}
    
    // Headers do Shopify
    const topic = request.headers.get('X-Shopify-Topic') || 'test';
    const shopDomain = request.headers.get('X-Shopify-Shop-Domain') || 'manual-test';
    const webhookId = request.headers.get('X-Shopify-Webhook-Id') || `test-${Date.now()}`;
    
    console.log('========================================');
    console.log('[WEBHOOK TEST] Recebido!');
    console.log('[WEBHOOK TEST] Timestamp:', timestamp);
    console.log('[WEBHOOK TEST] Topic:', topic);
    console.log('[WEBHOOK TEST] Shop:', shopDomain);
    console.log('[WEBHOOK TEST] Webhook ID:', webhookId);
    console.log('[WEBHOOK TEST] Body:', JSON.stringify(body).substring(0, 500));
    console.log('========================================');
    
    // Salvar no banco para verificação
    const supabase = getSupabase();
    if (supabase) {
      await supabase.from('webhook_test_logs').insert({
        source: 'shopify',
        topic,
        shop_domain: shopDomain,
        webhook_id: webhookId,
        payload: body,
        headers: {
          'x-shopify-topic': topic,
          'x-shopify-shop-domain': shopDomain,
          'x-shopify-webhook-id': webhookId,
          'x-shopify-hmac-sha256': request.headers.get('X-Shopify-Hmac-Sha256'),
        },
        received_at: timestamp,
      }).then(({ error }) => {
        if (error) console.log('[WEBHOOK TEST] Erro ao salvar log:', error.message);
        else console.log('[WEBHOOK TEST] Log salvo com sucesso!');
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Webhook recebido!',
      timestamp,
      topic,
      shopDomain,
    });
    
  } catch (error: any) {
    console.error('[WEBHOOK TEST] Erro:', error);
    return NextResponse.json({ 
      success: false, 
      error: error.message,
      timestamp,
    });
  }
}

// GET - Ver logs de teste
export async function GET(request: NextRequest) {
  const supabase = getSupabase();
  
  if (!supabase) {
    return NextResponse.json({ 
      error: 'Database not configured',
      hint: 'Mas o endpoint está funcionando! Se você ver isso, o servidor está OK.',
    });
  }
  
  try {
    // Tentar buscar logs
    const { data: logs, error } = await supabase
      .from('webhook_test_logs')
      .select('*')
      .eq('source', 'shopify')
      .order('received_at', { ascending: false })
      .limit(20);
    
    if (error) {
      // Tabela pode não existir
      return NextResponse.json({ 
        status: 'ok',
        message: 'Endpoint funcionando!',
        hint: 'A tabela webhook_test_logs não existe ainda. Crie ela ou ignore.',
        create_table_sql: `
          CREATE TABLE IF NOT EXISTS webhook_test_logs (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            source TEXT,
            topic TEXT,
            shop_domain TEXT,
            webhook_id TEXT,
            payload JSONB,
            headers JSONB,
            received_at TIMESTAMPTZ DEFAULT NOW()
          );
        `,
      });
    }
    
    return NextResponse.json({
      status: 'ok',
      message: 'Endpoint funcionando!',
      logs_count: logs?.length || 0,
      logs: logs || [],
    });
    
  } catch (error: any) {
    return NextResponse.json({ 
      status: 'error',
      error: error.message,
    });
  }
}
