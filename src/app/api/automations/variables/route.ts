// =============================================
// WORDER: API do Catálogo de Variáveis
// /src/app/api/automations/variables/route.ts
// =============================================

import { NextRequest, NextResponse } from 'next/server';
import { getAuthClient, authError } from '@/lib/api-utils';
import { 
  generateVariableCatalog, 
  createSampleContext,
  interpolateString,
  BASE_VARIABLES,
  TRIGGER_VARIABLES
} from '@/lib/automation/variables';

// =============================================
// GET - Obter catálogo de variáveis
// =============================================
export async function GET(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase } = auth;

  try {
    const searchParams = request.nextUrl.searchParams;
    
    const triggerType = searchParams.get('triggerType') || 'trigger_order';
    const previousNodesJson = searchParams.get('previousNodes');
    
    // Parse previous nodes
    let previousNodes: Array<{ id: string; type: string; label: string }> = [];
    if (previousNodesJson) {
      try {
        previousNodes = JSON.parse(previousNodesJson);
      } catch {
        // Ignorar erro de parse
      }
    }
    
    // Buscar schemas dos nós
    const { data: schemas } = await supabase
      .from('node_schemas')
      .select('node_type, output_schema');
    
    const schemaMap: Record<string, any> = {};
    schemas?.forEach((s: any) => {
      schemaMap[s.node_type] = { output_schema: s.output_schema };
    });
    
    // Gerar catálogo
    const catalog = generateVariableCatalog(triggerType, previousNodes, schemaMap);
    
    return NextResponse.json({
      catalog,
      triggerType,
      previousNodesCount: previousNodes.length
    });
    
  } catch (error: any) {
    console.error('Erro ao buscar catálogo:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// POST - Preview de interpolação
// =============================================
export async function POST(request: NextRequest) {
  const auth = await getAuthClient();
  if (!auth) return authError();
  const { supabase, user } = auth;

  try {
    const body = await request.json();
    
    const { 
      template,           // String com variáveis: "Olá {{contact.first_name}}"
      triggerType,        // Tipo do trigger
      contactId,          // ID do contato (opcional, para dados reais)
      useSampleData       // Usar dados de exemplo
    } = body;
    
    if (!template) {
      return NextResponse.json({ error: 'template required' }, { status: 400 });
    }
    
    let context;
    
    // Usar dados reais se tiver contactId - usa organization_id do usuário autenticado
    if (contactId && !useSampleData) {
      context = await buildRealContext(supabase, user.organization_id, contactId, triggerType);
    } else {
      // Usar dados de exemplo
      context = createSampleContext(triggerType || 'trigger_order');
    }
    
    // Interpolar
    const { result, warnings } = interpolateString(template, context);
    
    return NextResponse.json({
      template,
      result,
      warnings,
      context_used: useSampleData || !contactId ? 'sample' : 'real',
      variables_found: extractVariables(template)
    });
    
  } catch (error: any) {
    console.error('Erro no preview:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// =============================================
// Helpers
// =============================================

/**
 * Extrai variáveis de um template
 */
function extractVariables(template: string): string[] {
  const matches = template.matchAll(/\{\{([^}|]+)/g);
  const variables: string[] = [];
  
  for (const match of matches) {
    const varPath = match[1].trim();
    if (!variables.includes(varPath)) {
      variables.push(varPath);
    }
  }
  
  return variables;
}

/**
 * Constrói contexto real a partir do banco
 */
async function buildRealContext(
  supabase: any,
  organizationId: string,
  contactId: string,
  triggerType: string
) {
  const now = new Date();
  
  // Buscar contato - RLS filtra automaticamente
  const { data: contact } = await supabase
    .from('contacts')
    .select('*')
    .eq('id', contactId)
    .single();
  
  // Buscar deal mais recente do contato - RLS filtra automaticamente
  const { data: deals } = await supabase
    .from('deals')
    .select(`
      *,
      pipeline_stages(name),
      pipelines(name),
      profiles(full_name)
    `)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: false })
    .limit(1);
  
  const deal = deals?.[0];
  
  // Buscar automação - RLS filtra automaticamente
  const { data: automation } = await supabase
    .from('automations')
    .select('name')
    .limit(1)
    .single();
  
  return {
    execution_id: 'preview-' + Date.now(),
    automation_id: 'preview',
    organization_id: organizationId,
    
    contact: contact ? {
      id: contact.id,
      email: contact.email || '',
      phone: contact.phone || '',
      whatsapp: contact.whatsapp || contact.phone || '',
      first_name: contact.first_name || '',
      last_name: contact.last_name || '',
      full_name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
      company: contact.company || '',
      position: contact.position || '',
      tags: contact.tags || [],
      total_orders: contact.total_orders || 0,
      total_spent: parseFloat(contact.total_spent) || 0,
      created_at: contact.created_at,
      custom_fields: contact.custom_fields || {}
    } : {
      id: '',
      email: '',
      phone: '',
      first_name: '',
      last_name: '',
      full_name: '',
      tags: [],
      total_orders: 0,
      total_spent: 0,
      created_at: '',
      custom_fields: {}
    },
    
    deal: deal ? {
      id: deal.id,
      title: deal.title,
      value: parseFloat(deal.value) || 0,
      stage_id: deal.stage_id,
      stage_name: deal.pipeline_stages?.name || '',
      pipeline_id: deal.pipeline_id,
      pipeline_name: deal.pipelines?.name || '',
      assigned_to: deal.assigned_to,
      assigned_to_name: deal.profiles?.full_name || '',
      status: deal.status,
      probability: deal.probability,
      created_at: deal.created_at
    } : undefined,
    
    trigger: {
      type: triggerType || 'trigger_order',
      node_id: 'preview-trigger',
      data: getSampleTriggerData(triggerType)
    },
    
    nodes: {},
    
    system: {
      current_date: now.toISOString().split('T')[0],
      current_time: now.toTimeString().split(' ')[0],
      current_datetime: now.toISOString(),
      automation_name: automation?.name || 'Preview',
      execution_id: 'preview-' + Date.now(),
      organization_id: organizationId
    }
  };
}

function getSampleTriggerData(triggerType: string): Record<string, any> {
  switch (triggerType) {
    case 'trigger_order':
      return {
        order_id: 'ORD-PREVIEW',
        order_value: 299.90,
        order_status: 'paid',
        products: [{ name: 'Produto Exemplo', quantity: 1 }]
      };
    case 'trigger_abandon':
      return {
        cart_id: 'CART-PREVIEW',
        cart_value: 450.00,
        cart_url: 'https://loja.com/cart/preview'
      };
    default:
      return {};
  }
}
