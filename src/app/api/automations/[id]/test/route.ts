import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/api-utils';
import { SupabaseClient } from '@supabase/supabase-js';

let _supabase: SupabaseClient | null = null;
function getDb(): SupabaseClient {
  if (!_supabase) {
    _supabase = getSupabaseClient();
    if (!_supabase) throw new Error('Database not configured');
  }
  return _supabase;
}

const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) { return (getDb() as any)[prop]; }
});

// Tipos
interface NodeExecutionResult {
  nodeId: string;
  status: 'success' | 'error' | 'skipped';
  output?: any;
  error?: string;
  duration: number;
  variablesUsed?: Record<string, any>;
}

interface TestExecutionResult {
  success: boolean;
  executionId: string;
  contact: any;
  trigger: any;
  steps: NodeExecutionResult[];
  totalDuration: number;
  error?: string;
}

// Simula execução de um nó
async function executeNode(
  node: any,
  context: Record<string, any>,
  isTest: boolean = true
): Promise<{ output: any; error?: string }> {
  const { type, data } = node;
  const config = data?.config || {};
  
  // Simula delay de processamento
  await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));

  switch (type) {
    // ========== TRIGGERS ==========
    case 'trigger_order':
      return {
        output: {
          order_id: `ORD-${Date.now()}`,
          order_number: Math.floor(1000 + Math.random() * 9000),
          order_value: context.trigger?.order_value || 299.90,
          order_status: config.orderStatus || 'paid',
          products: context.trigger?.products || [
            { name: 'Produto Exemplo', price: 149.95, quantity: 2 }
          ],
          triggered_at: new Date().toISOString(),
        }
      };

    case 'trigger_abandon':
      return {
        output: {
          cart_id: `CART-${Date.now()}`,
          cart_value: context.trigger?.cart_value || 450.00,
          cart_items: context.trigger?.cart_items || 3,
          abandon_time: config.abandonTime || 30,
          products: [
            { name: 'Produto no Carrinho', price: 150.00, quantity: 3 }
          ],
          triggered_at: new Date().toISOString(),
        }
      };

    case 'trigger_signup':
      return {
        output: {
          signup_source: config.source || 'website',
          signup_date: new Date().toISOString(),
          contact_id: context.contact?.id,
        }
      };

    case 'trigger_tag':
      return {
        output: {
          tag_name: config.tagName || 'vip',
          tag_added_at: new Date().toISOString(),
        }
      };

    case 'trigger_deal_created':
    case 'trigger_deal_stage':
    case 'trigger_deal_won':
    case 'trigger_deal_lost':
      return {
        output: {
          deal_id: `DEAL-${Date.now()}`,
          deal_title: context.deal?.title || 'Deal de Teste',
          deal_value: context.deal?.value || 5000,
          pipeline: config.pipelineId || 'default',
          stage: config.stageId || 'negotiation',
        }
      };

    case 'trigger_webhook':
      return {
        output: {
          webhook_received: true,
          payload: { test: true, timestamp: Date.now() },
        }
      };

    // ========== ACTIONS ==========
    case 'action_email':
      if (isTest) {
        return {
          output: {
            action: 'email',
            simulated: true,
            to: context.contact?.email || 'teste@exemplo.com',
            template: config.template || 'default',
            subject: config.subject || 'Assunto do Email',
            message: `[TESTE] Email seria enviado para ${context.contact?.email}`,
            variables_resolved: {
              contact_name: context.contact?.first_name || 'Cliente',
            }
          }
        };
      }
      // Em produção, enviaria de verdade
      return { output: { sent: true, to: context.contact?.email } };

    case 'action_whatsapp':
      if (isTest) {
        return {
          output: {
            action: 'whatsapp',
            simulated: true,
            to: context.contact?.phone || '+5511999999999',
            template: config.template || 'default',
            message: `[TESTE] WhatsApp seria enviado para ${context.contact?.phone}`,
          }
        };
      }
      return { output: { sent: true, to: context.contact?.phone } };

    case 'action_sms':
      if (isTest) {
        return {
          output: {
            action: 'sms',
            simulated: true,
            to: context.contact?.phone || '+5511999999999',
            message: `[TESTE] SMS seria enviado para ${context.contact?.phone}`,
          }
        };
      }
      return { output: { sent: true, to: context.contact?.phone } };

    case 'action_tag':
      return {
        output: {
          action: 'add_tag',
          tag: config.tagName || 'nova-tag',
          contact_id: context.contact?.id,
          applied: true,
        }
      };

    case 'action_update':
      return {
        output: {
          action: 'update_contact',
          fields_updated: config.fields || { custom_field: 'value' },
          contact_id: context.contact?.id,
        }
      };

    case 'action_create_deal':
      return {
        output: {
          action: 'create_deal',
          deal_id: `DEAL-NEW-${Date.now()}`,
          title: config.title || 'Novo Deal',
          value: config.value || 1000,
          pipeline_id: config.pipelineId,
        }
      };

    case 'action_move_deal':
      return {
        output: {
          action: 'move_deal',
          deal_id: context.deal?.id || 'DEAL-123',
          new_stage: config.stageId || 'closed_won',
        }
      };

    case 'action_notify':
      return {
        output: {
          action: 'internal_notification',
          message: config.message || 'Notificação de teste',
          channel: config.channel || 'app',
          sent: true,
        }
      };

    case 'action_webhook':
      if (isTest) {
        return {
          output: {
            action: 'webhook',
            simulated: true,
            url: config.url || 'https://exemplo.com/webhook',
            method: config.method || 'POST',
            message: '[TESTE] Webhook seria chamado',
          }
        };
      }
      return { output: { called: true, url: config.url } };

    // ========== LOGIC ==========
    case 'logic_delay':
      const delayUnit = config.delayUnit || 'minutes';
      const delayValue = config.delay || 5;
      return {
        output: {
          action: 'delay',
          delay: delayValue,
          unit: delayUnit,
          message: `[TESTE] Aguardaria ${delayValue} ${delayUnit}`,
          skipped_in_test: true,
        }
      };

    case 'logic_condition':
      // Avalia condição simples
      const field = config.field || 'contact.total_orders';
      const operator = config.operator || 'greater_than';
      const compareValue = config.value || 0;
      
      let fieldValue = field.split('.').reduce((obj: any, key: string) => obj?.[key], context);
      let conditionMet = false;
      
      switch (operator) {
        case 'equals':
          conditionMet = fieldValue == compareValue;
          break;
        case 'not_equals':
          conditionMet = fieldValue != compareValue;
          break;
        case 'greater_than':
          conditionMet = Number(fieldValue) > Number(compareValue);
          break;
        case 'less_than':
          conditionMet = Number(fieldValue) < Number(compareValue);
          break;
        case 'contains':
          conditionMet = String(fieldValue).includes(String(compareValue));
          break;
        default:
          conditionMet = true;
      }
      
      return {
        output: {
          action: 'condition',
          field,
          operator,
          compare_value: compareValue,
          actual_value: fieldValue,
          condition_met: conditionMet,
          branch: conditionMet ? 'true' : 'false',
        }
      };

    case 'logic_split':
      // A/B split - escolhe aleatoriamente para teste
      const splitA = config.splitA || 50;
      const random = Math.random() * 100;
      const selectedBranch = random < splitA ? 'A' : 'B';
      
      return {
        output: {
          action: 'ab_split',
          split_a_percent: splitA,
          split_b_percent: 100 - splitA,
          random_value: random.toFixed(2),
          selected_branch: selectedBranch,
        }
      };

    default:
      return {
        output: { 
          message: `Nó ${type} executado`,
          config 
        }
      };
  }
}

// Ordena nós por dependência (topological sort simplificado)
function getExecutionOrder(nodes: any[], edges: any[]): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  
  // Encontra o trigger (sempre primeiro)
  const triggerNode = nodes.find((n: any) => n.type?.startsWith('trigger_'));
  if (triggerNode) {
    order.push(triggerNode.id);
    visited.add(triggerNode.id);
  }
  
  // BFS a partir do trigger
  const queue = [...order];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    // Encontra nós conectados a partir deste
    const connectedEdges = edges.filter((e: any) => e.source === currentId);
    for (const edge of connectedEdges) {
      if (!visited.has(edge.target)) {
        visited.add(edge.target);
        order.push(edge.target);
        queue.push(edge.target);
      }
    }
  }
  
  return order;
}

// Encontra próximos nós baseado em condições
function getNextNodes(
  currentNodeId: string,
  currentOutput: any,
  edges: any[]
): string[] {
  const outgoingEdges = edges.filter((e: any) => e.source === currentNodeId);
  
  // Se é um nó de condição, filtra por branch
  if (currentOutput?.branch) {
    const matchingEdges = outgoingEdges.filter((e: any) => 
      e.sourceHandle === currentOutput.branch || 
      e.sourceHandle === `output-${currentOutput.branch}` ||
      !e.sourceHandle // fallback para edges sem handle específico
    );
    return matchingEdges.map((e: any) => e.target);
  }
  
  // Se é A/B split, escolhe o branch selecionado
  if (currentOutput?.selected_branch) {
    const branch = currentOutput.selected_branch.toLowerCase();
    const matchingEdges = outgoingEdges.filter((e: any) => 
      e.sourceHandle === branch ||
      e.sourceHandle === `output-${branch}` ||
      !e.sourceHandle
    );
    // Se não encontrou edge específico, retorna primeiro
    if (matchingEdges.length === 0 && outgoingEdges.length > 0) {
      return [outgoingEdges[0].target];
    }
    return matchingEdges.map((e: any) => e.target);
  }
  
  return outgoingEdges.map((e: any) => e.target);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: automationId } = await params;
    const body = await request.json();
    const { contactId, useSampleData = false, organizationId } = body;

    if (!organizationId) {
      return NextResponse.json({ error: 'organizationId é obrigatório' }, { status: 400 });
    }

    // Buscar automação
    const { data: automation, error: automationError } = await supabase
      .from('automations')
      .select('*')
      .eq('id', automationId)
      .eq('organization_id', organizationId)
      .single();

    if (automationError || !automation) {
      return NextResponse.json({ error: 'Automação não encontrada' }, { status: 404 });
    }

    const nodes = automation.nodes || [];
    const edges = automation.edges || [];

    if (nodes.length === 0) {
      return NextResponse.json({ error: 'Automação não possui nós' }, { status: 400 });
    }

    // Buscar ou criar contato de teste
    let contact: any = null;
    
    if (contactId && !useSampleData) {
      const { data: contactData } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', contactId)
        .eq('organization_id', organizationId)
        .single();
      
      contact = contactData;
    }

    // Se não tem contato, usa dados de exemplo
    if (!contact) {
      contact = {
        id: 'sample-contact-id',
        email: 'cliente.teste@exemplo.com',
        phone: '+5511999999999',
        first_name: 'João',
        last_name: 'Silva',
        full_name: 'João Silva',
        total_orders: 5,
        total_spent: 1500.00,
        tags: ['cliente', 'vip'],
        created_at: new Date().toISOString(),
        custom_fields: {
          preferencia: 'email',
          aniversario: '1990-05-15',
        }
      };
    }

    // Contexto inicial
    const context: Record<string, any> = {
      contact,
      deal: {
        id: 'sample-deal-id',
        title: 'Deal de Teste',
        value: 5000,
        stage: 'negotiation',
      },
      trigger: {
        order_value: 299.90,
        cart_value: 450.00,
        products: [
          { name: 'Produto A', price: 149.95, quantity: 2 }
        ]
      },
      system: {
        current_date: new Date().toISOString(),
        automation_name: automation.name,
        execution_id: `TEST-${Date.now()}`,
      },
      nodes: {} as Record<string, any>,
    };

    // Execução
    const executionId = `TEST-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const steps: NodeExecutionResult[] = [];
    const startTime = Date.now();
    
    // Ordem de execução
    const executionOrder = getExecutionOrder(nodes, edges);
    const executedNodes = new Set<string>();

    // Executa nós em ordem
    for (const nodeId of executionOrder) {
      if (executedNodes.has(nodeId)) continue;
      
      const node = nodes.find((n: any) => n.id === nodeId);
      if (!node) continue;

      const stepStart = Date.now();
      
      try {
        const result = await executeNode(node, context, true);
        const duration = Date.now() - stepStart;
        
        // Salva output no contexto para próximos nós
        context.nodes[nodeId] = result.output;
        
        steps.push({
          nodeId,
          status: result.error ? 'error' : 'success',
          output: result.output,
          error: result.error,
          duration,
        });
        
        executedNodes.add(nodeId);

        // Determina próximos nós baseado no output
        const nextNodes = getNextNodes(nodeId, result.output, edges);
        
        // Se é condição ou split, marca nós não escolhidos como skipped
        if (result.output?.branch || result.output?.selected_branch) {
          const allNextFromCurrent = edges
            .filter((e: any) => e.source === nodeId)
            .map((e: any) => e.target);
          
          for (const targetId of allNextFromCurrent) {
            if (!nextNodes.includes(targetId) && !executedNodes.has(targetId)) {
              steps.push({
                nodeId: targetId,
                status: 'skipped',
                output: { reason: 'Condição não atendida' },
                duration: 0,
              });
              executedNodes.add(targetId);
            }
          }
        }
        
      } catch (err: any) {
        steps.push({
          nodeId,
          status: 'error',
          error: err.message || 'Erro desconhecido',
          duration: Date.now() - stepStart,
        });
        executedNodes.add(nodeId);
      }
    }

    const totalDuration = Date.now() - startTime;

    // Resultado final
    const result: TestExecutionResult = {
      success: steps.every((s: NodeExecutionResult) => s.status !== 'error'),
      executionId,
      contact,
      trigger: context.trigger,
      steps,
      totalDuration,
    };

    return NextResponse.json(result);

  } catch (error: any) {
    console.error('Erro ao testar automação:', error);
    return NextResponse.json(
      { 
        error: error.message || 'Erro interno',
        success: false,
        steps: [],
      },
      { status: 500 }
    );
  }
}
