import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { verifyQStashSignature, enqueueAutomationStep, calculateDelaySeconds } from '@/lib/queue';

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Supabase not configured');
  return createClient(url, key);
}

export async function POST(request: NextRequest) {
  // Verificar assinatura
  const { isValid, body } = await verifyQStashSignature(request);
  
  if (!isValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { type, data } = body;

  if (type !== 'automation_step') {
    return NextResponse.json({ error: 'Invalid job type' }, { status: 400 });
  }

  const { runId, nodeId, context } = data;
  const supabase = getSupabase();

  console.log(`[Step Worker] Processing step ${nodeId} for run ${runId}`);

  try {
    // Buscar run
    const { data: run, error } = await supabase
      .from('automation_runs')
      .select('*, automation:automations(*)')
      .eq('id', runId)
      .single();

    if (error || !run) {
      throw new Error(`Run not found: ${runId}`);
    }

    // Verificar se foi cancelado
    if (run.status === 'cancelled') {
      return NextResponse.json({ success: true, skipped: true });
    }

    // Atualizar status
    await supabase
      .from('automation_runs')
      .update({ status: 'running', current_node_id: nodeId })
      .eq('id', runId);

    // Pegar nodes e edges
    const nodes = run.automation.nodes || [];
    const edges = run.automation.edges || [];

    let currentNodeId: string | null = nodeId;
    let currentContext = context;

    while (currentNodeId) {
      const currentNode = nodes.find((n: any) => n.id === currentNodeId);
      if (!currentNode) break;

      console.log(`[Step Worker] Executing node: ${currentNode.type}`);

      // Executar node
      const nodeResult = await executeNodeSimple(
        supabase,
        run.automation.organization_id,
        currentNode,
        currentContext
      );

      // Se é delay, agendar próximo step
      if (currentNode.type === 'logic_delay' || currentNode.data?.type === 'delay') {
        const delayConfig = currentNode.data?.config?.delay || { value: 1, unit: 'hours' };
        const delaySeconds = calculateDelaySeconds(delayConfig.value, delayConfig.unit);
        
        const nextEdge = edges.find((e: any) => e.source === currentNodeId);
        if (nextEdge?.target && delaySeconds > 0) {
          await enqueueAutomationStep(
            runId, 
            nextEdge.target, 
            { ...currentContext, ...nodeResult }, 
            delaySeconds
          );
          
          await supabase
            .from('automation_runs')
            .update({ status: 'waiting', current_node_id: nextEdge.target })
            .eq('id', runId);
          
          return NextResponse.json({ success: true, waiting: true });
        }
      }

      currentContext = { ...currentContext, ...nodeResult };

      // Próximo node
      const outgoingEdge = edges.find((e: any) => {
        if (e.source !== currentNodeId) return false;
        if (currentNode.type === 'logic_condition') {
          return e.sourceHandle === (nodeResult.conditionResult ? 'true' : 'false');
        }
        return true;
      });

      currentNodeId = outgoingEdge?.target || null;
    }

    // Completou
    await supabase
      .from('automation_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error(`[Step Worker] Failed:`, error);
    
    await supabase
      .from('automation_runs')
      .update({
        status: 'failed',
        error_message: error.message,
      })
      .eq('id', runId);

    return NextResponse.json({ success: false, error: error.message });
  }
}

// Execução simplificada de node
async function executeNodeSimple(
  supabase: any,
  organizationId: string,
  node: any,
  context: any
): Promise<Record<string, any>> {
  const nodeType = node.type || node.data?.type;
  const config = node.data?.config || {};

  switch (nodeType) {
    case 'logic_condition':
    case 'condition':
      return evaluateCondition(config, context);
      
    case 'logic_split':
    case 'ab_split':
      const random = Math.random() * 100;
      return { variant: random < (config.splitPercentage || 50) ? 'A' : 'B' };
      
    case 'logic_delay':
    case 'delay':
      return { delayed: true };
      
    case 'action_tag':
    case 'add_tag':
      if (context.contact_id && config.tagName) {
        const { data: contact } = await supabase
          .from('contacts')
          .select('tags')
          .eq('id', context.contact_id)
          .single();
        const tags = contact?.tags || [];
        if (!tags.includes(config.tagName)) {
          await supabase
            .from('contacts')
            .update({ tags: [...tags, config.tagName] })
            .eq('id', context.contact_id);
        }
      }
      return { tagAdded: config.tagName };
      
    case 'action_notify':
    case 'notify_team':
      await supabase.from('notifications').insert({
        organization_id: organizationId,
        type: 'automation',
        title: config.title || 'Automação',
        message: interpolate(config.message || '', context),
      });
      return { notified: true };
      
    default:
      return {};
  }
}

function evaluateCondition(config: any, context: any): { conditionResult: boolean } {
  const { field, operator, value } = config;
  const fieldValue = field?.split('.').reduce((o: any, k: string) => o?.[k], context);
  
  let result = false;
  switch (operator) {
    case 'equals': result = fieldValue === value; break;
    case 'not_equals': result = fieldValue !== value; break;
    case 'contains': result = String(fieldValue || '').includes(value); break;
    case 'greater_than': result = Number(fieldValue) > Number(value); break;
    case 'less_than': result = Number(fieldValue) < Number(value); break;
    case 'is_empty': result = !fieldValue; break;
    case 'is_not_empty': result = !!fieldValue; break;
  }
  return { conditionResult: result };
}

function interpolate(template: string, context: any): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_, path) => {
    return path.split('.').reduce((o: any, k: string) => o?.[k], context) || '';
  });
}
