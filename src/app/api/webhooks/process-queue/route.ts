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

// Importar executor de ações e tipo
import { executeAction, ActionContext } from '@/lib/automation/actions';

// =====================================================
// TYPES
// =====================================================

interface QueueItem {
  id: string;
  organization_id: string;
  trigger_type: string;
  trigger_data: any;
  contact_id: string | null;
  deal_id: string | null;
  attempts: number;
  max_attempts: number;
}

interface AutomationNode {
  id: string;
  type: string;
  data: {
    label?: string;
    config?: any;
  };
  position: { x: number; y: number };
}

interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

// =====================================================
// MAIN PROCESSOR
// =====================================================

async function processQueueItem(item: QueueItem): Promise<{ success: boolean; error?: string }> {
  console.log(`[Queue] Processing item ${item.id} - trigger: ${item.trigger_type}`);
  
  try {
    // 1. Buscar automações que correspondem ao trigger
    const { data: automations, error: autoError } = await supabase
      .rpc('get_automations_for_trigger', {
        p_organization_id: item.organization_id,
        p_trigger_type: item.trigger_type,
        p_trigger_data: item.trigger_data
      });

    if (autoError) {
      console.error('[Queue] Error fetching automations:', autoError);
      throw new Error(`Erro ao buscar automações: ${autoError.message}`);
    }

    if (!automations || automations.length === 0) {
      console.log(`[Queue] No active automations found for trigger ${item.trigger_type}`);
      return { success: true }; // Não é erro, só não tem automação
    }

    console.log(`[Queue] Found ${automations.length} automation(s) to execute`);

    // 2. Buscar dados do contato (se houver)
    let contact = null;
    if (item.contact_id) {
      const { data } = await supabase
        .from('contacts')
        .select('*')
        .eq('id', item.contact_id)
        .single();
      contact = data;
    }

    // 3. Buscar dados do deal (se houver)
    let deal = null;
    if (item.deal_id) {
      const { data } = await supabase
        .from('deals')
        .select('*, pipeline:pipelines(name), stage:pipeline_stages(name)')
        .eq('id', item.deal_id)
        .single();
      deal = data;
    }

    // 4. Executar cada automação
    for (const automation of automations) {
      await executeAutomation({
        automationId: automation.automation_id,
        automationName: automation.automation_name,
        nodes: automation.nodes || [],
        edges: automation.edges || [],
        triggerConfig: automation.trigger_config,
        organizationId: item.organization_id,
        queueItemId: item.id,
        contact,
        deal,
        triggerType: item.trigger_type,
        triggerData: item.trigger_data,
      });
    }

    return { success: true };

  } catch (error: any) {
    console.error('[Queue] Error processing item:', error);
    return { success: false, error: error.message };
  }
}

// =====================================================
// AUTOMATION EXECUTOR
// =====================================================

interface ExecuteAutomationParams {
  automationId: string;
  automationName: string;
  nodes: AutomationNode[];
  edges: AutomationEdge[];
  triggerConfig: any;
  organizationId: string;
  queueItemId: string;
  contact: any;
  deal: any;
  triggerType: string;
  triggerData: any;
}

async function executeAutomation(params: ExecuteAutomationParams): Promise<void> {
  const {
    automationId,
    automationName,
    nodes,
    edges,
    organizationId,
    queueItemId,
    contact,
    deal,
    triggerType,
    triggerData,
  } = params;

  console.log(`[Automation] Executing "${automationName}" (${automationId})`);
  
  const startTime = Date.now();

  // 1. Criar registro de execução
  const { data: run, error: runError } = await supabase
    .from('automation_runs')
    .insert({
      organization_id: organizationId,
      automation_id: automationId,
      queue_item_id: queueItemId,
      contact_id: contact?.id,
      deal_id: deal?.id,
      status: 'running',
      trigger_type: triggerType,
      trigger_data: triggerData,
      total_steps: nodes.length,
      context: { contact, deal, trigger: triggerData },
    })
    .select()
    .single();

  if (runError || !run) {
    console.error('[Automation] Error creating run record:', runError);
    throw new Error('Erro ao criar registro de execução');
  }

  const runId = run.id;
  let completedSteps = 0;
  let failedSteps = 0;
  let errorMessage: string | null = null;
  let errorNodeId: string | null = null;

  try {
    // 2. Construir contexto de execução
    const context: ActionContext = {
      contact: contact || {},
      deal: deal || {},
      trigger: triggerData,
      system: {
        current_date: new Date().toISOString(),
        automation_name: automationName,
        execution_id: runId,
      },
      nodes: {},
    };

    // 3. Ordenar nós para execução (topological sort)
    const executionOrder = getExecutionOrder(nodes, edges);
    
    // 4. Executar cada nó
    let stepOrder = 0;
    for (const nodeId of executionOrder) {
      const node = nodes.find((n: AutomationNode) => n.id === nodeId);
      if (!node) continue;

      stepOrder++;
      const stepStartTime = Date.now();

      // Criar registro do step
      const { data: step } = await supabase
        .from('automation_run_steps')
        .insert({
          run_id: runId,
          node_id: node.id,
          node_type: node.type,
          node_label: node.data.label || node.type,
          status: 'running',
          config_used: node.data.config || {},
          step_order: stepOrder,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      try {
        // Executar a ação do nó
        const result = await executeNodeAction(node, context, organizationId);
        
        const stepDuration = Date.now() - stepStartTime;

        // Salvar output no contexto
        context.nodes[nodeId] = result.output;

        // Atualizar step com sucesso
        await supabase
          .from('automation_run_steps')
          .update({
            status: result.skipped ? 'skipped' : 'success',
            output_data: result.output,
            variables_resolved: result.variables || {},
            completed_at: new Date().toISOString(),
            duration_ms: stepDuration,
          })
          .eq('id', step?.id);

        if (!result.skipped) {
          completedSteps++;
        }

        // Se for condição, determinar próximo branch
        if (result.branch) {
          // Marcar nós do outro branch como skipped
          const otherBranchNodes = getOtherBranchNodes(nodeId, result.branch, edges, nodes);
          for (const skipNodeId of otherBranchNodes) {
            await supabase
              .from('automation_run_steps')
              .insert({
                run_id: runId,
                node_id: skipNodeId,
                node_type: nodes.find((n: AutomationNode) => n.id === skipNodeId)?.type || 'unknown',
                node_label: nodes.find((n: AutomationNode) => n.id === skipNodeId)?.data.label || 'Unknown',
                status: 'skipped',
                step_order: ++stepOrder,
                output_data: { reason: 'Condição não atendida' },
                completed_at: new Date().toISOString(),
                duration_ms: 0,
              });
          }
        }

        // Se for delay, agendar continuação
        if (result.scheduleDelay) {
          await scheduleDelayedContinuation(
            runId,
            automationId,
            organizationId,
            nodeId,
            context,
            result.scheduleDelay,
            contact?.id,
            deal?.id
          );
          // Interrompe execução - será continuada depois
          break;
        }

      } catch (nodeError: any) {
        const stepDuration = Date.now() - stepStartTime;
        
        // Atualizar step com erro
        await supabase
          .from('automation_run_steps')
          .update({
            status: 'error',
            error_message: nodeError.message,
            error_details: { stack: nodeError.stack },
            completed_at: new Date().toISOString(),
            duration_ms: stepDuration,
          })
          .eq('id', step?.id);

        failedSteps++;
        errorMessage = nodeError.message;
        errorNodeId = nodeId;
        
        // Por padrão, interrompe no primeiro erro
        // (poderia ter opção de continuar em caso de erro)
        break;
      }
    }

    // 5. Finalizar execução
    const totalDuration = Date.now() - startTime;
    const finalStatus = failedSteps > 0 ? 'failed' : 'completed';

    await supabase
      .from('automation_runs')
      .update({
        status: finalStatus,
        completed_at: new Date().toISOString(),
        duration_ms: totalDuration,
        completed_steps: completedSteps,
        failed_steps: failedSteps,
        error_message: errorMessage,
        error_node_id: errorNodeId,
      })
      .eq('id', runId);

    console.log(`[Automation] Completed "${automationName}" - ${finalStatus} (${totalDuration}ms)`);

  } catch (error: any) {
    // Erro geral na execução
    await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        duration_ms: Date.now() - startTime,
        error_message: error.message,
      })
      .eq('id', runId);

    console.error(`[Automation] Failed "${automationName}":`, error);
    throw error;
  }
}

// =====================================================
// NODE EXECUTOR
// =====================================================

interface NodeExecutionResult {
  output: any;
  variables?: Record<string, any>;
  branch?: string; // Para condições
  skipped?: boolean;
  scheduleDelay?: number; // Milissegundos para agendar
}

async function executeNodeAction(
  node: AutomationNode,
  context: ActionContext,
  organizationId: string
): Promise<NodeExecutionResult> {
  const { type, data } = node;
  const config = data?.config || {};

  console.log(`[Node] Executing ${type} (${node.id})`);

  // Triggers apenas retornam os dados
  if (type.startsWith('trigger_')) {
    return {
      output: {
        triggered: true,
        trigger_type: type,
        trigger_data: context.trigger,
      }
    };
  }

  // Lógica de delay
  if (type === 'logic_delay') {
    const delayValue = config.delay || 5;
    const delayUnit = config.delayUnit || 'minutes';
    
    let delayMs = delayValue;
    switch (delayUnit) {
      case 'minutes': delayMs = delayValue * 60 * 1000; break;
      case 'hours': delayMs = delayValue * 60 * 60 * 1000; break;
      case 'days': delayMs = delayValue * 24 * 60 * 60 * 1000; break;
    }

    return {
      output: {
        action: 'delay',
        delay_value: delayValue,
        delay_unit: delayUnit,
        scheduled_for: new Date(Date.now() + delayMs).toISOString(),
      },
      scheduleDelay: delayMs,
    };
  }

  // Lógica de condição
  if (type === 'logic_condition') {
    const field = config.field || 'contact.total_orders';
    const operator = config.operator || 'greater_than';
    const compareValue = config.value || 0;
    
    const fieldValue = getNestedValue(context, field);
    const conditionMet = evaluateCondition(fieldValue, operator, compareValue);

    return {
      output: {
        action: 'condition',
        field,
        operator,
        compare_value: compareValue,
        actual_value: fieldValue,
        condition_met: conditionMet,
      },
      branch: conditionMet ? 'true' : 'false',
    };
  }

  // Lógica de split A/B
  if (type === 'logic_split') {
    const splitA = config.splitA || 50;
    const random = Math.random() * 100;
    const selectedBranch = random < splitA ? 'a' : 'b';

    return {
      output: {
        action: 'ab_split',
        split_a_percent: splitA,
        random_value: random.toFixed(2),
        selected_branch: selectedBranch.toUpperCase(),
      },
      branch: selectedBranch,
    };
  }

  // Ações reais - delegar para o módulo de ações
  const actionResult = await executeAction(type, config, context, organizationId);
  
  return {
    output: actionResult.output,
    variables: actionResult.variables,
  };
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function getExecutionOrder(nodes: AutomationNode[], edges: AutomationEdge[]): string[] {
  const order: string[] = [];
  const visited = new Set<string>();
  
  // Encontra o trigger (sempre primeiro)
  const triggerNode = nodes.find((n: AutomationNode) => n.type?.startsWith('trigger_'));
  if (triggerNode) {
    order.push(triggerNode.id);
    visited.add(triggerNode.id);
  }
  
  // BFS a partir do trigger
  const queue = [...order];
  while (queue.length > 0) {
    const currentId = queue.shift()!;
    
    const connectedEdges = edges.filter((e: AutomationEdge) => e.source === currentId);
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

function getOtherBranchNodes(
  conditionNodeId: string,
  selectedBranch: string,
  edges: AutomationEdge[],
  nodes: AutomationNode[]
): string[] {
  const otherBranch = selectedBranch === 'true' ? 'false' : selectedBranch === 'a' ? 'b' : 'a';
  
  const otherEdges = edges.filter((e: AutomationEdge) => 
    e.source === conditionNodeId && 
    (e.sourceHandle === otherBranch || e.sourceHandle === `output-${otherBranch}`)
  );

  // Coleta todos os nós do outro branch recursivamente
  const otherNodes: string[] = [];
  const toVisit = otherEdges.map((e: AutomationEdge) => e.target);
  
  while (toVisit.length > 0) {
    const nodeId = toVisit.shift()!;
    if (!otherNodes.includes(nodeId)) {
      otherNodes.push(nodeId);
      const nextEdges = edges.filter((e: AutomationEdge) => e.source === nodeId);
      toVisit.push(...nextEdges.map((e: AutomationEdge) => e.target));
    }
  }

  return otherNodes;
}

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

function evaluateCondition(fieldValue: any, operator: string, compareValue: any): boolean {
  switch (operator) {
    case 'equals':
      return fieldValue == compareValue;
    case 'not_equals':
      return fieldValue != compareValue;
    case 'greater_than':
      return Number(fieldValue) > Number(compareValue);
    case 'less_than':
      return Number(fieldValue) < Number(compareValue);
    case 'greater_or_equal':
      return Number(fieldValue) >= Number(compareValue);
    case 'less_or_equal':
      return Number(fieldValue) <= Number(compareValue);
    case 'contains':
      return String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
    case 'not_contains':
      return !String(fieldValue).toLowerCase().includes(String(compareValue).toLowerCase());
    case 'is_empty':
      return !fieldValue || fieldValue === '' || fieldValue === null;
    case 'is_not_empty':
      return fieldValue && fieldValue !== '' && fieldValue !== null;
    default:
      return true;
  }
}

async function scheduleDelayedContinuation(
  runId: string,
  automationId: string,
  organizationId: string,
  afterNodeId: string,
  context: ActionContext,
  delayMs: number,
  contactId?: string,
  dealId?: string
): Promise<void> {
  const executeAt = new Date(Date.now() + delayMs);
  
  await supabase
    .from('scheduled_automation_jobs')
    .insert({
      organization_id: organizationId,
      automation_id: automationId,
      run_id: runId,
      contact_id: contactId,
      deal_id: dealId,
      continue_from_node_id: afterNodeId,
      context,
      execute_at: executeAt.toISOString(),
      status: 'scheduled',
    });

  console.log(`[Delay] Scheduled continuation for ${executeAt.toISOString()}`);
}

// =====================================================
// API ROUTES
// =====================================================

// POST: Processar fila (chamado por cron ou webhook)
export async function POST(request: NextRequest) {
  try {
    // Validar API key (segurança básica)
    const authHeader = request.headers.get('authorization');
    const apiKey = process.env.INTERNAL_API_KEY;
    
    if (apiKey && authHeader !== `Bearer ${apiKey}`) {
      // Se tem API key configurada, valida
      // Se não tem, permite (dev mode)
      if (apiKey) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    }

    const body = await request.json().catch(() => ({}));
    const { limit = 10 } = body;

    // 1. Buscar items pendentes na fila
    const { data: queueItems, error: queueError } = await supabase
      .from('automation_queue')
      .select('*')
      .eq('status', 'pending')
      .lt('attempts', 3)
      .order('created_at', { ascending: true })
      .limit(limit);

    if (queueError) {
      console.error('[Queue] Error fetching queue:', queueError);
      return NextResponse.json({ error: queueError.message }, { status: 500 });
    }

    if (!queueItems || queueItems.length === 0) {
      return NextResponse.json({ message: 'No items to process', processed: 0 });
    }

    console.log(`[Queue] Found ${queueItems.length} items to process`);

    let processed = 0;
    let failed = 0;

    // 2. Processar cada item
    for (const item of queueItems) {
      // Marcar como processing
      await supabase
        .from('automation_queue')
        .update({ 
          status: 'processing',
          attempts: item.attempts + 1
        })
        .eq('id', item.id);

      const result = await processQueueItem(item);

      if (result.success) {
        // Marcar como completed
        await supabase
          .from('automation_queue')
          .update({ 
            status: 'completed',
            processed_at: new Date().toISOString()
          })
          .eq('id', item.id);
        processed++;
      } else {
        // Marcar como failed (ou pending se ainda tem tentativas)
        const newStatus = item.attempts + 1 >= item.max_attempts ? 'failed' : 'pending';
        await supabase
          .from('automation_queue')
          .update({ 
            status: newStatus,
            error_message: result.error
          })
          .eq('id', item.id);
        failed++;
      }
    }

    return NextResponse.json({
      message: 'Queue processed',
      total: queueItems.length,
      processed,
      failed,
    });

  } catch (error: any) {
    console.error('[Queue] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// GET: Status da fila
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organizationId');

    let query = supabase
      .from('automation_queue')
      .select('status', { count: 'exact', head: false });

    if (organizationId) {
      query = query.eq('organization_id', organizationId);
    }

    // Contar por status
    const { data: pending } = await supabase
      .from('automation_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'pending');

    const { data: processing } = await supabase
      .from('automation_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'processing');

    const { data: completed } = await supabase
      .from('automation_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'completed');

    const { data: failed } = await supabase
      .from('automation_queue')
      .select('id', { count: 'exact' })
      .eq('status', 'failed');

    return NextResponse.json({
      queue: {
        pending: pending?.length || 0,
        processing: processing?.length || 0,
        completed: completed?.length || 0,
        failed: failed?.length || 0,
      }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
