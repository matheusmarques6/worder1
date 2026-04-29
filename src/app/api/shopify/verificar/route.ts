// =============================================
// API: Verificação SIMPLES - HTML
// src/app/api/shopify/verificar/route.ts
// 
// Acesse: /api/shopify/verificar
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  const orgId = user.organization_id;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  
  const results: any = {
    timestamp: new Date().toISOString(),
    appUrl,
    webhookUrl: `${appUrl}/api/webhooks/shopify`,
    checks: [],
  };
  
  // Check 1: Database - já passou se chegou aqui
  results.checks.push({ name: 'Database', status: '✅', message: 'Conectado' });
  
  // Check 2: Loja conectada - RLS filtra automaticamente
  const { data: store, error } = await supabase
    .from('shopify_stores')
    .select('*')
    .maybeSingle();
  
  if (error) {
    results.checks.push({ name: 'Loja Shopify', status: '❌', message: error.message });
  } else if (!store) {
    results.checks.push({ name: 'Loja Shopify', status: '❌', message: 'Nenhuma loja encontrada' });
  } else {
    results.store = {
      domain: store.shop_domain,
      name: store.shop_name,
      is_active: store.is_active,
      has_token: !!store.access_token,
      pipeline_id: store.default_pipeline_id,
    };
    results.checks.push({ 
      name: 'Loja Shopify', 
      status: store.is_active ? '✅' : '⚠️', 
      message: `${store.shop_domain} (${store.is_active ? 'ativa' : 'inativa'})` 
    });
    
    // Check 3: Pipeline configurado
    if (store.default_pipeline_id) {
      results.checks.push({ name: 'Pipeline', status: '✅', message: store.default_pipeline_id });
    } else {
      results.checks.push({ name: 'Pipeline', status: '❌', message: 'NÃO CONFIGURADO - Deals não serão criados!' });
    }
    
    // Check 4: Webhooks no Shopify
    if (store.access_token) {
      try {
        const webhooksRes = await fetch(
          `https://${store.shop_domain}/admin/api/2026-04/webhooks.json`,
          { headers: { 'X-Shopify-Access-Token': store.access_token } }
        );
        
        if (webhooksRes.ok) {
          const { webhooks } = await webhooksRes.json();
          results.webhooks = webhooks?.map((w: any) => ({
            topic: w.topic,
            url: w.address,
            correct: w.address.includes('/api/webhooks/shopify'),
          })) || [];
          
          const correctCount = results.webhooks.filter((w: any) => w.correct).length;
          const wrongCount = results.webhooks.filter((w: any) => !w.correct).length;
          
          if (results.webhooks.length === 0) {
            results.checks.push({ name: 'Webhooks', status: '❌', message: 'NENHUM webhook registrado!' });
          } else if (wrongCount > 0) {
            results.checks.push({ name: 'Webhooks', status: '⚠️', message: `${correctCount} corretos, ${wrongCount} com URL errada` });
          } else {
            results.checks.push({ name: 'Webhooks', status: '✅', message: `${correctCount} webhooks OK` });
          }
        } else {
          results.checks.push({ name: 'Webhooks', status: '❌', message: 'Não foi possível verificar (token inválido?)' });
        }
      } catch (e: any) {
        results.checks.push({ name: 'Webhooks', status: '❌', message: e.message });
      }
    }
    
    // Check 5: Eventos recebidos
    const { data: events } = await supabase
      .from('shopify_webhook_events')
      .select('id, topic, status, received_at')
      .eq('store_id', store.id)
      .order('received_at', { ascending: false })
      .limit(10);
    
    results.recentEvents = events || [];
    
    if (!events || events.length === 0) {
      results.checks.push({ name: 'Eventos recebidos', status: '⚠️', message: 'Nenhum evento recebido ainda' });
    } else {
      results.checks.push({ name: 'Eventos recebidos', status: '✅', message: `${events.length} eventos recentes` });
    }
    
    // Check 6: Contatos do Shopify - RLS filtra automaticamente
    const { count } = await supabase
      .from('contacts')
      .select('id', { count: 'exact' })
      .eq('source', 'shopify');
    
    results.contactsCount = count || 0;
    if (count === 0) {
      results.checks.push({ name: 'Contatos Shopify', status: '⚠️', message: 'Nenhum contato criado ainda' });
    } else {
      results.checks.push({ name: 'Contatos Shopify', status: '✅', message: `${count} contatos` });
    }
  }
  
  // Gerar HTML
  const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Verificação Shopify</title>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    * { box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; 
      color: #e2e8f0; 
      padding: 20px;
      max-width: 800px;
      margin: 0 auto;
    }
    h1 { color: #96bf48; margin-bottom: 10px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .card { 
      background: #1e293b; 
      border-radius: 12px; 
      padding: 20px; 
      margin-bottom: 20px;
      border: 1px solid #334155;
    }
    .card h2 { margin-top: 0; color: #f8fafc; font-size: 18px; }
    .check { 
      display: flex; 
      align-items: center; 
      padding: 12px 0; 
      border-bottom: 1px solid #334155;
    }
    .check:last-child { border-bottom: none; }
    .check-status { font-size: 20px; margin-right: 12px; }
    .check-name { font-weight: 600; min-width: 150px; }
    .check-message { color: #94a3b8; }
    .url { 
      background: #0f172a; 
      padding: 10px 15px; 
      border-radius: 8px; 
      font-family: monospace;
      font-size: 14px;
      color: #4ade80;
      word-break: break-all;
    }
    .webhook { 
      display: flex; 
      justify-content: space-between; 
      align-items: center;
      padding: 8px 12px;
      background: #0f172a;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 14px;
    }
    .webhook.correct { border-left: 3px solid #4ade80; }
    .webhook.wrong { border-left: 3px solid #f87171; }
    .btn {
      display: inline-block;
      background: #3b82f6;
      color: white;
      padding: 12px 24px;
      border-radius: 8px;
      text-decoration: none;
      font-weight: 600;
      margin-top: 10px;
    }
    .btn:hover { background: #2563eb; }
    .btn-fix { background: #22c55e; }
    .btn-fix:hover { background: #16a34a; }
    .event {
      padding: 8px 12px;
      background: #0f172a;
      border-radius: 6px;
      margin-bottom: 8px;
      font-size: 13px;
      display: flex;
      justify-content: space-between;
    }
    .badge {
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
    }
    .badge-success { background: #166534; color: #4ade80; }
    .badge-error { background: #7f1d1d; color: #fca5a5; }
    .badge-pending { background: #854d0e; color: #fde047; }
    pre { 
      background: #0f172a; 
      padding: 15px; 
      border-radius: 8px; 
      overflow-x: auto;
      font-size: 12px;
    }
  </style>
</head>
<body>
  <h1>🛒 Verificação Shopify</h1>
  <p class="subtitle">Verificado em: ${results.timestamp}</p>
  
  <div class="card">
    <h2>Status Geral</h2>
    ${results.checks.map((c: any) => `
      <div class="check">
        <span class="check-status">${c.status}</span>
        <span class="check-name">${c.name}</span>
        <span class="check-message">${c.message}</span>
      </div>
    `).join('')}
  </div>
  
  <div class="card">
    <h2>URL do Webhook</h2>
    <p style="color: #94a3b8; margin-bottom: 10px;">Esta é a URL que deve estar configurada no Shopify:</p>
    <div class="url">${results.webhookUrl}</div>
  </div>
  
  ${results.webhooks ? `
  <div class="card">
    <h2>Webhooks Registrados (${results.webhooks.length})</h2>
    ${results.webhooks.length === 0 ? '<p style="color: #f87171;">❌ Nenhum webhook! Clique no botão abaixo para registrar.</p>' : ''}
    ${results.webhooks.map((w: any) => `
      <div class="webhook ${w.correct ? 'correct' : 'wrong'}">
        <span>${w.topic}</span>
        <span style="color: ${w.correct ? '#4ade80' : '#f87171'}">${w.correct ? '✓ OK' : '✗ URL errada'}</span>
      </div>
    `).join('')}
    
    <a href="/api/cron/shopify?job=health" class="btn btn-fix" target="_blank">
      🔧 Corrigir Webhooks
    </a>
  </div>
  ` : ''}
  
  ${results.recentEvents ? `
  <div class="card">
    <h2>Últimos Eventos Recebidos (${results.recentEvents.length})</h2>
    ${results.recentEvents.length === 0 ? '<p style="color: #94a3b8;">Nenhum evento recebido ainda. Faça um pedido de teste no Shopify.</p>' : ''}
    ${results.recentEvents.map((e: any) => `
      <div class="event">
        <span>${e.topic}</span>
        <span class="badge ${e.status === 'processed' ? 'badge-success' : e.status === 'failed' ? 'badge-error' : 'badge-pending'}">${e.status}</span>
        <span style="color: #64748b;">${new Date(e.received_at).toLocaleString('pt-BR')}</span>
      </div>
    `).join('')}
  </div>
  ` : ''}
  
  ${results.store ? `
  <div class="card">
    <h2>Dados da Loja</h2>
    <pre>${JSON.stringify(results.store, null, 2)}</pre>
  </div>
  ` : ''}
  
  <div class="card">
    <h2>🧪 Próximos Passos</h2>
    <ol style="color: #94a3b8; line-height: 2;">
      <li>Clique em <strong>"Corrigir Webhooks"</strong> acima</li>
      <li>Vá no <strong>Admin do Shopify</strong> → Configurações → Notificações → Webhooks</li>
      <li>Verifique se os webhooks apontam para: <code>${results.webhookUrl}</code></li>
      <li>Crie um <strong>pedido de teste</strong> no Shopify</li>
      <li><strong>Atualize esta página</strong> e veja se o evento apareceu</li>
    </ol>
    
    <a href="${request.url}" class="btn">🔄 Atualizar Página</a>
  </div>
  
  <script>
    // Auto refresh a cada 30 segundos
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
  `;
  
  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
