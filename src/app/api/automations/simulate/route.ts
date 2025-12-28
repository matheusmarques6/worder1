// =============================================
// Simulate Shopify Webhook - Test Automations
// src/app/api/automations/simulate/route.ts
//
// POST: Simula um evento do Shopify para testar regras
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { executeAutomationRules } from '@/lib/services/automation/automation-executor';

export const dynamic = 'force-dynamic';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  const supabase = getSupabase();
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 });
  }

  try {
    const body = await request.json();
    const { 
      organizationId, 
      triggerEvent = 'order_paid',
      orderValue = 150.00,
      customerName = 'Cliente Teste',
      customerEmail = 'teste@exemplo.com',
    } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId é obrigatório' }, { status: 400 });
    }

    // 1. Verificar se há regras ativas
    const { data: rules, error: rulesError } = await supabase
      .from('pipeline_automation_rules')
      .select('id, name, trigger_event, initial_stage_id')
      .eq('organization_id', organizationId)
      .eq('source_type', 'shopify')
      .eq('trigger_event', triggerEvent)
      .eq('is_enabled', true);

    if (rulesError) {
      return NextResponse.json({
        success: false,
        error: 'Erro ao buscar regras',
        details: rulesError.message,
        hint: 'Verifique se a migration foi executada no Supabase',
      }, { status: 500 });
    }

    if (!rules || rules.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Nenhuma regra ativa encontrada',
        details: `Não há regras ativas para shopify/${triggerEvent}`,
        hint: 'Crie uma regra de automação na modal de Pipeline > Automações',
      }, { status: 404 });
    }

    // 2. Buscar ou criar contato de teste
    let contact = null;
    const { data: existingContact } = await supabase
      .from('contacts')
      .select('id, email, first_name')
      .eq('organization_id', organizationId)
      .eq('email', customerEmail)
      .maybeSingle();

    if (existingContact) {
      contact = existingContact;
    } else {
      // Criar contato de teste
      const { data: newContact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: organizationId,
          email: customerEmail,
          first_name: customerName.split(' ')[0],
          last_name: customerName.split(' ').slice(1).join(' ') || 'Teste',
          source: 'shopify',
          tags: ['teste', 'simulacao'],
        })
        .select('id, email, first_name')
        .single();

      if (contactError) {
        return NextResponse.json({
          success: false,
          error: 'Erro ao criar contato de teste',
          details: contactError.message,
        }, { status: 500 });
      }
      contact = newContact;
    }

    // 3. Simular dados do evento
    const eventData = {
      order_id: `TEST-${Date.now()}`,
      order_number: `#${Math.floor(Math.random() * 10000)}`,
      total_price: orderValue,
      currency: 'BRL',
      financial_status: 'paid',
      fulfillment_status: null,
      customer_name: customerName,
      customer: {
        id: `test-${contact.id}`,
        email: customerEmail,
        first_name: customerName.split(' ')[0],
        last_name: customerName.split(' ').slice(1).join(' '),
        tags: '',
      },
      line_items: [
        {
          title: 'Produto Teste',
          quantity: 1,
          price: orderValue.toString(),
        }
      ],
    };

    // 4. Executar regras de automação
    const result = await executeAutomationRules(
      organizationId,
      'shopify',
      triggerEvent,
      contact.id,
      eventData
    );

    // 5. Retornar resultado
    return NextResponse.json({
      success: true,
      message: result.dealsCreated > 0 
        ? `✅ ${result.dealsCreated} deal(s) criado(s) com sucesso!`
        : '⚠️ Nenhum deal criado (verifique os filtros das regras)',
      
      simulation: {
        triggerEvent,
        orderValue,
        customerName,
        customerEmail,
        contactId: contact.id,
      },
      
      rulesFound: rules.map(r => ({
        id: r.id,
        name: r.name,
        event: r.trigger_event,
      })),
      
      executionResult: {
        rulesExecuted: result.rulesExecuted,
        dealsCreated: result.dealsCreated,
        errors: result.errors,
        details: result.details,
      },
      
      nextSteps: result.dealsCreated > 0 
        ? ['Verifique o CRM para ver o deal criado', 'Configure webhooks reais no Shopify']
        : ['Verifique os filtros das regras (valor mínimo, tags, etc)', 'Tente com um valor de pedido diferente'],
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}

// GET para mostrar instruções
export async function GET() {
  return NextResponse.json({
    endpoint: '/api/automations/simulate',
    method: 'POST',
    description: 'Simula um evento do Shopify para testar regras de automação',
    
    body: {
      organizationId: '(obrigatório) ID da sua organização',
      triggerEvent: '(opcional) order_created | order_paid | order_fulfilled - default: order_paid',
      orderValue: '(opcional) Valor do pedido simulado - default: 150.00',
      customerName: '(opcional) Nome do cliente - default: Cliente Teste',
      customerEmail: '(opcional) Email do cliente - default: teste@exemplo.com',
    },
    
    example: {
      organizationId: 'seu-organization-id-aqui',
      triggerEvent: 'order_paid',
      orderValue: 250.00,
      customerName: 'João Silva',
      customerEmail: 'joao@teste.com',
    },
  });
}
