/**
 * EXECUTION ENGINE - UPDATED VERSION
 * Core engine for executing automation workflows
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { VariableContext, variableEngine, createExecutionContext } from './variable-engine';
import { nodeExecutors, NodeExecutionResult } from './node-executors';
import {
  withNodeTimeout,
  timeoutForNodeType,
  withCircuit,
  CircuitOpenError,
  NodeTimeoutError,
} from './node-timeout';

// ============================================
// TYPES
// ============================================

export interface WorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: {
    label: string;
    description?: string;
    category: 'trigger' | 'action' | 'condition' | 'control' | 'transform';
    nodeType: string;
    config: Record<string, any>;
    credentialId?: string;
  };
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

export interface Workflow {
  id: string;
  name?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings?: {
    timezone?: string;
    errorHandling?: 'stop' | 'continue' | 'retry';
    maxRetries?: number;
    retryDelay?: number;
  };
}

export interface ExecutionOptions {
  isTest?: boolean;
  context?: Partial<VariableContext>;
  credentials?: Record<string, any>;
  executionId?: string;
  startFromNodeId?: string;
  resumeAfterNodeId?: string;
  triggerData?: Record<string, any>;
  contactId?: string;
  dealId?: string;
  orderId?: string;
  organizationId?: string;  // ← CRÍTICO: Para isolamento multi-tenant
  // ISO timestamp of when this run was created — used as the floor for
  // exit-condition event scans so we only cancel on events that
  // happened AFTER the run started, not on unrelated past purchases.
  runStartedAt?: string;
}

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'error' | 'waiting' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  nodeResults: Record<string, NodeExecutionResult>;
  context: Partial<VariableContext>;
  finalContext: Partial<VariableContext>;
  error?: string;
  errorNodeId?: string;
  waitingAt?: {
    nodeId: string;
    resumeAt: Date;
    data: any;
  };
}

interface ExecutionEngineConfig {
  supabase: SupabaseClient;
  isTest?: boolean;
}

// ============================================
// EXECUTION ENGINE CLASS
// ============================================

export class ExecutionEngine {
  private supabase: SupabaseClient;
  private isTest: boolean;

  constructor(config: ExecutionEngineConfig) {
    this.supabase = config.supabase;
    this.isTest = config.isTest || false;
  }

  /**
   * Execute the workflow
   */
  async execute(
    workflow: Workflow,
    options: ExecutionOptions = {}
  ): Promise<ExecutionResult> {
    const startedAt = new Date();
    const executionId = options.executionId || `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const nodeResults: Record<string, NodeExecutionResult> = {};
    
    // Initialize context
    const triggerNode = workflow.nodes.find(n => n.data.category === 'trigger');
    let context: VariableContext = options.context as VariableContext || createExecutionContext({
      automationId: workflow.id,
      automationName: workflow.name || 'Automação',
      executionId,
      triggerType: triggerNode?.data.nodeType || 'manual',
      triggerData: options.context?.trigger?.data || {},
      timezone: workflow.settings?.timezone,
      runStartedAt: options.runStartedAt,
    });

    // Belt-and-suspenders: callers that build the context themselves
    // (process-runs cron, automation worker) may forget to set
    // workflow.startedAt. Backfill from options.runStartedAt so the
    // exit-condition check below has a real floor.
    if (options.runStartedAt) {
      const wf: any = (context as any).workflow || {};
      if (!wf.startedAt) wf.startedAt = options.runStartedAt;
      (context as any).workflow = wf;
    }

    // ⚠️ CRÍTICO: Garantir organizationId no contexto para isolamento
    if (options.organizationId) {
      (context as any).organizationId = options.organizationId;
    }

    // Populate product recommendations from the trigger anchor product.
    // Email/WhatsApp templates can reference {{ recommendations.fbt[0].title }}
    // — this is what surfaces them with real data at render time. Fire and
    // forget: an empty recs object is fine if the cron hasn't materialized
    // anything yet for this product.
    if (options.organizationId && !(context as any).recommendations) {
      try {
        const { populateRecommendations, extractAnchorProductId } = await import('./recommendations-populator');
        const anchorId = extractAnchorProductId(context.trigger?.data || {});
        const recs = await populateRecommendations({
          organizationId: options.organizationId,
          productId: anchorId,
        });
        (context as any).recommendations = recs;
      } catch (recErr: any) {
        console.warn('[Execution Engine] recommendations populate failed:', recErr?.message);
      }
    }

    // Populate merchant-defined custom variables. Each row maps a
    // friendly key (e.g. customer_full_name) to a path expression
    // (e.g. trigger.raw.customer.first_name). At render time we
    // resolve each path against the rest of the context and expose the
    // result on context.custom.<key> so templates can reference
    // {{ custom.customer_full_name }} etc.
    if (options.organizationId && !(context as any).custom) {
      try {
        const { getSupabaseAdmin } = await import('@/lib/supabase-admin');
        // @ts-ignore — lodash types may not be installed
        const lodashMod = await import('lodash');
        const lodashGet = (lodashMod as any).get || (lodashMod as any).default?.get;
        const admin = getSupabaseAdmin();
        const { data: customVars } = await admin
          .from('custom_variables')
          .select('variable_key, path, fallback_path, default_value, applicable_triggers, enabled')
          .eq('organization_id', options.organizationId)
          .eq('enabled', true);
        const customCtx: Record<string, any> = {};
        for (const v of customVars || []) {
          const triggerType = (context.trigger as any)?.type;
          const apps = (v as any).applicable_triggers as string[] | null;
          if (Array.isArray(apps) && apps.length > 0 && triggerType && !apps.includes(triggerType)) continue;
          let value: any = lodashGet(context, (v as any).path);
          if ((value === undefined || value === null || value === '') && (v as any).fallback_path) {
            value = lodashGet(context, (v as any).fallback_path);
          }
          if ((value === undefined || value === null || value === '') && (v as any).default_value !== null) {
            value = (v as any).default_value;
          }
          customCtx[(v as any).variable_key] = value ?? null;
        }
        (context as any).custom = customCtx;
      } catch (e: any) {
        console.warn('[Execution Engine] custom variables populate failed:', e?.message);
      }
    }

    // Ensure nodes object exists in context
    if (!context.nodes) {
      context.nodes = {};
    }

    try {
      // Build execution order, optionally starting from a specific node (resume)
      let executionOrder = this.buildExecutionOrder(workflow);
      const resumeAfter = options.resumeAfterNodeId;
      if (resumeAfter) {
        // Resume after a paused node: keep every node reachable from
        // the paused node's outgoing edges, BUT skip the paused node
        // itself (it already ran). This handles the case where the
        // pause has multiple outgoing edges (e.g. delay → logic_split):
        // a flat slice would silently drop one sibling when topological
        // order puts it before the start point.
        const reachable = new Set<string>();
        const adj = new Map<string, string[]>();
        for (const e of (workflow.edges || [])) {
          if (!adj.has(e.source)) adj.set(e.source, []);
          adj.get(e.source)!.push(e.target);
        }
        const queue: string[] = [...(adj.get(resumeAfter) || [])];
        while (queue.length > 0) {
          const id = queue.shift()!;
          if (reachable.has(id)) continue;
          reachable.add(id);
          for (const next of adj.get(id) || []) queue.push(next);
        }
        executionOrder = executionOrder.filter(n => reachable.has(n.id));
      } else if (options.startFromNodeId) {
        const startIdx = executionOrder.findIndex(n => n.id === options.startFromNodeId);
        if (startIdx > 0) {
          executionOrder = executionOrder.slice(startIdx);
        }
      }
      
      // Get exit conditions from the trigger node config or workflow settings
      const triggerNode = workflow.nodes.find(n => n.data.category === 'trigger');
      const exitConditions: Array<{ type: string; eventType?: string; field?: string; operator?: string; value?: string }> =
        [...(triggerNode?.data.config?.exitConditions || [])];

      // Smart defaults: cart-recovery flows always cancel on conversion,
      // even if the merchant forgot to add the exit condition manually.
      // Mirrors Klaviyo's "has not placed order since starting this flow"
      // step filter and Omnisend's default goal on Cart Abandonment.
      const triggerType = triggerNode?.data.nodeType || (triggerNode?.type as any) || '';
      const recoveryTriggers = new Set([
        'trigger_checkout_abandoned',
        'trigger_abandon',
        'trigger_added_to_cart',
        'trigger_browse_abandoned',
      ]);
      if (recoveryTriggers.has(triggerType)) {
        const has = (et: string) =>
          exitConditions.some(c => c.type === 'event' && c.eventType === et);
        if (!has('placed_order')) {
          exitConditions.push({ type: 'event', eventType: 'placed_order' });
        }
        if (!has('checkout_completed')) {
          exitConditions.push({ type: 'event', eventType: 'checkout_completed' });
        }
      }

      // Execute nodes in order
      for (const node of executionOrder) {
        // Skip if already processed (from branching)
        if (nodeResults[node.id]?.status === 'skipped') {
          continue;
        }

        // Check exit conditions before each node (except trigger itself)
        if (exitConditions.length > 0 && node.data.category !== 'trigger' && !this.isTest) {
          const shouldExit = await this.checkExitConditions(exitConditions, context, options.organizationId);
          if (shouldExit) {
            return this.createResult(executionId, 'cancelled', startedAt, nodeResults, context, {
              error: 'Exit condition met — automation cancelled',
            });
          }
        }

        const nodeStartTime = Date.now();

        try {
          // Get executor for this node type
          const nodeType = node.data.nodeType || node.type;
          const executor = nodeExecutors[nodeType];
          
          if (!executor) {
            // Trigger nodes are entry markers — the actual trigger matching
            // happens upstream in the dispatcher/event-processor, so a trigger
            // without a dedicated executor is expected and must passthrough,
            // NOT error. Only action/condition/control nodes without an
            // executor are genuine misconfigurations.
            const isTriggerNode = node.data.category === 'trigger' || String(nodeType).startsWith('trigger_');
            if (isTriggerNode) {
              nodeResults[node.id] = {
                status: 'success',
                output: context.trigger?.data ?? node.data.config ?? {},
                duration: Date.now() - nodeStartTime,
              };
              continue;
            }
            console.error(`[ExecutionEngine] No executor for node type: ${nodeType} — marking as error`);
            nodeResults[node.id] = {
              status: 'error',
              output: null,
              error: `Node type "${nodeType}" não tem handler registrado. Verifique se o tipo de nó é válido.`,
              duration: Date.now() - nodeStartTime,
            };
            if (workflow.settings?.errorHandling === 'stop') break;
            continue;
          }

          // Process config with variables
          const processedConfig = variableEngine.processObject(node.data.config, context);

          // Get credentials if needed
          let credentials = options.credentials?.[node.data.credentialId || ''];
          if (!credentials && node.data.credentialId) {
            credentials = await this.getCredentials(node.data.credentialId);
          }

          // Execute the node com timeout + circuit breaker por automação
          // ⚠️ CRÍTICO: Passar organizationId para isolamento
          const timeoutMs = timeoutForNodeType(nodeType);
          const circuitKey = `automation:${workflow.id}`;
          const result = await withCircuit(
            circuitKey,
            () =>
              withNodeTimeout(
                node.id,
                timeoutMs,
                executor.execute({
                  node,
                  config: processedConfig,
                  context,
                  credentials,
                  supabase: this.supabase,
                  isTest: this.isTest,
                  organizationId: options.organizationId || (context as any).organizationId,
                })
              ),
            { threshold: 5, cooldownMs: 60_000 }
          );

          nodeResults[node.id] = {
            ...result,
            duration: Date.now() - nodeStartTime,
          };

          // Update context with node output
          context.nodes[node.id] = {
            output: result.output,
            executedAt: new Date().toISOString(),
          };

          // Handle special results
          if (result.status === 'error' && workflow.settings?.errorHandling === 'stop') {
            return this.createResult(executionId, 'error', startedAt, nodeResults, context, {
              error: result.error,
              errorNodeId: node.id,
            });
          }

          if (result.status === 'waiting' && result.waitUntil) {
            // Disambiguate "this node finished its work and just needs
            // wall-clock time" (delay nodes) from "this node punted; it
            // hasn't actually run yet" (email postponed for quiet hours).
            // The resume code in process-runs / workers reads this flag:
            //   rerunOnResume=false → skip the paused node (resumeAfterNodeId)
            //   rerunOnResume=true  → re-execute it (startFromNodeId)
            const pausedType = node.data?.nodeType || (node as any).type || '';
            const isDelayNode =
              pausedType === 'control_delay' || pausedType === 'action_delay';
            return this.createResult(executionId, 'waiting', startedAt, nodeResults, context, {
              waitingAt: {
                nodeId: node.id,
                resumeAt: result.waitUntil,
                data: result.output,
                rerunOnResume: !isDelayNode,
              } as any,
            });
          }

          // Handle branching (conditions)
          if (result.branch) {
            this.markSkippedBranches(workflow, node.id, result.branch, nodeResults);
          }

          // Handle explicit exit ("Sair" node). The contact leaves the
          // flow here: mark everything downstream of this node as skipped
          // (defensive — the node is normally a leaf) and end the run with
          // 'cancelled', the same outcome an exit-condition produces.
          if (result.exit) {
            const descendants = new Set<string>();
            this.collectDescendants(workflow, node.id, descendants);
            for (const id of descendants) {
              if (!nodeResults[id]) {
                nodeResults[id] = {
                  status: 'skipped',
                  output: { reason: 'Contato saiu do fluxo' },
                  duration: 0,
                };
              }
            }
            return this.createResult(executionId, 'cancelled', startedAt, nodeResults, context, {
              error: result.output?.reason || 'Contato saiu do fluxo (nó Sair)',
            });
          }

        } catch (nodeError: any) {
          const isTimeout = nodeError instanceof NodeTimeoutError;
          const isCircuitOpen = nodeError instanceof CircuitOpenError;

          nodeResults[node.id] = {
            status: 'error',
            output: null,
            error: nodeError.message,
            duration: Date.now() - nodeStartTime,
            ...(isTimeout ? { timedOut: true } : {}),
            ...(isCircuitOpen ? { circuitOpen: true } : {}),
          };

          // Circuit breaker aberto → para imediatamente para não queimar recursos
          if (isCircuitOpen) {
            return this.createResult(executionId, 'error', startedAt, nodeResults, context, {
              error: `Circuit breaker aberto: muitas falhas consecutivas. ${nodeError.message}`,
              errorNodeId: node.id,
            });
          }

          // Timeout → sempre para (evita deixar run em 'running' para sempre)
          if (isTimeout) {
            return this.createResult(executionId, 'error', startedAt, nodeResults, context, {
              error: nodeError.message,
              errorNodeId: node.id,
            });
          }

          if (workflow.settings?.errorHandling === 'stop') {
            return this.createResult(executionId, 'error', startedAt, nodeResults, context, {
              error: nodeError.message,
              errorNodeId: node.id,
            });
          }
        }
      }

      return this.createResult(executionId, 'success', startedAt, nodeResults, context);

    } catch (error: any) {
      console.error('Execution error:', error);
      return this.createResult(executionId, 'error', startedAt, nodeResults, context, {
        error: error.message,
      });
    }
  }

  /**
   * Build execution order using topological sort
   */
  private buildExecutionOrder(workflow: Workflow): WorkflowNode[] {
    const { nodes, edges } = workflow;
    const result: WorkflowNode[] = [];
    const visited = new Set<string>();
    const inDegree = new Map<string, number>();
    const adjacencyList = new Map<string, string[]>();

    // Initialize
    for (const node of nodes) {
      inDegree.set(node.id, 0);
      adjacencyList.set(node.id, []);
    }

    // Build adjacency list and in-degree
    for (const edge of edges) {
      const targets = adjacencyList.get(edge.source) || [];
      targets.push(edge.target);
      adjacencyList.set(edge.source, targets);
      inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    }

    // Find all nodes with in-degree 0 (triggers)
    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    // Process queue (BFS)
    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodes.find(n => n.id === nodeId);
      if (node) {
        result.push(node);
      }

      // Process neighbors
      const neighbors = adjacencyList.get(nodeId) || [];
      for (const neighbor of neighbors) {
        const newDegree = (inDegree.get(neighbor) || 0) - 1;
        inDegree.set(neighbor, newDegree);
        if (newDegree === 0) {
          queue.push(neighbor);
        }
      }
    }

    return result;
  }

  /**
   * Mark branches that should be skipped based on condition result
   */
  private markSkippedBranches(
    workflow: Workflow,
    nodeId: string,
    selectedBranch: string,
    nodeResults: Record<string, NodeExecutionResult>
  ): void {
    const nodeEdges = workflow.edges.filter(e => e.source === nodeId);
    const skippedTargets = new Set<string>();
    
    for (const edge of nodeEdges) {
      // Check if this edge matches the selected branch
      const edgeHandle = edge.sourceHandle || 'default';
      const matches = edgeHandle === selectedBranch || 
                     edgeHandle === `output-${selectedBranch}` ||
                     (selectedBranch === 'true' && edgeHandle === 'yes') ||
                     (selectedBranch === 'false' && edgeHandle === 'no');
      
      if (!matches) {
        skippedTargets.add(edge.target);
        this.collectDescendants(workflow, edge.target, skippedTargets);
      }
    }

    // Mark as skipped
    for (const targetId of skippedTargets) {
      if (!nodeResults[targetId]) {
        nodeResults[targetId] = {
          status: 'skipped',
          output: { reason: 'Condição não atendida' },
          duration: 0,
        };
      }
    }
  }

  /**
   * Collect all descendant nodes
   */
  private collectDescendants(workflow: Workflow, nodeId: string, collected: Set<string>): void {
    const edges = workflow.edges.filter(e => e.source === nodeId);
    
    for (const edge of edges) {
      if (!collected.has(edge.target)) {
        collected.add(edge.target);
        this.collectDescendants(workflow, edge.target, collected);
      }
    }
  }

  /**
   * Check exit conditions — returns true if automation should stop
   */
  private async checkExitConditions(
    exitConditions: Array<{ type: string; eventType?: string; field?: string; operator?: string; value?: string }>,
    context: Partial<VariableContext>,
    organizationId?: string
  ): Promise<boolean> {
    for (const cond of exitConditions) {
      try {
        if (cond.type === 'event' && cond.eventType) {
          // Check if a specific event occurred for this contact since the run started.
          //
          // CRITICAL: the floor MUST be the run's started_at, not "24h
          // ago". Cart-recovery flows used to cancel for any contact
          // who had placed_order in the past 24h — including unrelated
          // purchases from yesterday — so all repeat customers with a
          // new abandoned cart had their recovery flow killed before
          // the first email.
          //
          // Without a floor we'd match the original "placed_order" that
          // happened weeks ago for this contact. With a 24h fallback we
          // matched yesterday's order. Default now to the run created_at
          // (always set when we come through createExecutionContext or
          // the engine's backfill above), and only fall back to 5
          // minutes ago — enough to catch racy completions that fired
          // right after the trigger but before the engine started.
          const contactId = context.contact?.id;
          if (contactId && organizationId) {
            const startedAt =
              (context as any).workflow?.startedAt ||
              new Date(Date.now() - 5 * 60 * 1000).toISOString();
            const { data: events } = await this.supabase
              .from('contact_events')
              .select('id')
              .eq('contact_id', contactId)
              .eq('event_type', cond.eventType)
              .gte('occurred_at', startedAt)
              .limit(1);

            if (events && events.length > 0) {
              console.log(`[ExitCondition] Event "${cond.eventType}" found for contact ${contactId} since ${startedAt} — exiting`);
              return true;
            }
          }
        } else if (cond.type === 'property' && cond.field) {
          // Check if a contact property matches
          const contactId = context.contact?.id;
          if (contactId && organizationId) {
            const { data: contact } = await this.supabase
              .from('contacts')
              .select(cond.field)
              .eq('id', contactId)
              .single();

            if (contact) {
              const currentValue = String((contact as Record<string, any>)[cond.field] || '');
              const operator = cond.operator || 'equals';
              const targetValue = cond.value || '';

              let matches = false;
              switch (operator) {
                case 'equals': matches = currentValue === targetValue; break;
                case 'not_equals': matches = currentValue !== targetValue; break;
                case 'is_set': matches = currentValue !== '' && currentValue !== 'null'; break;
                case 'is_not_set': matches = currentValue === '' || currentValue === 'null'; break;
                case 'contains': matches = currentValue.includes(targetValue); break;
                case 'greater_than': matches = parseFloat(currentValue) > parseFloat(targetValue); break;
                case 'less_than': matches = parseFloat(currentValue) < parseFloat(targetValue); break;
              }

              if (matches) {
                console.log(`[ExitCondition] Property "${cond.field}" ${operator} "${targetValue}" matched — exiting`);
                return true;
              }
            }
          }
        }
      } catch (err) {
        console.error('[ExitCondition] Error checking condition:', err);
      }
    }
    return false;
  }

  /**
   * Get decrypted credentials
   */
  private async getCredentials(credentialId: string): Promise<Record<string, any>> {
    try {
      const { data, error } = await this.supabase
        .from('credentials')
        .select('encrypted_data, type')
        .eq('id', credentialId)
        .single();

      if (error || !data) {
        console.error(`[Credentials] Not found: ${credentialId} — node will fail`);
        return { _error: `Credencial "${credentialId}" não encontrada` };
      }

      const { decryptCredential } = await import('./credential-encryption');
      const decrypted = decryptCredential((data as any).encrypted_data);
      if (!decrypted || Object.keys(decrypted).length === 0) {
        console.error(`[Credentials] Decryption returned empty for ${credentialId}`);
        return { _error: 'Falha ao descriptografar credencial — chave pode ter sido rotacionada' };
      }
      return { ...decrypted, type: (data as any).type };
    } catch (err) {
      console.error('[Credentials] Decryption error:', err);
      return { _error: `Erro ao descriptografar credencial: ${(err as any)?.message || 'unknown'}` };
    }
  }

  /**
   * Create execution result
   */
  private createResult(
    executionId: string,
    status: ExecutionResult['status'],
    startedAt: Date,
    nodeResults: Record<string, NodeExecutionResult>,
    context: Partial<VariableContext>,
    extra: Partial<ExecutionResult> = {}
  ): ExecutionResult {
    const completedAt = status !== 'waiting' ? new Date() : undefined;
    
    return {
      executionId,
      status,
      startedAt,
      completedAt,
      duration: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
      nodeResults,
      context,
      finalContext: context,
      ...extra,
    };
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Execute a workflow
 */
export async function executeWorkflow(
  workflow: Workflow,
  options: ExecutionOptions & { supabaseUrl?: string; supabaseKey?: string } = {}
): Promise<ExecutionResult> {
  const supabase = createClient(
    options.supabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL!,
    options.supabaseKey || process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const engine = new ExecutionEngine({
    supabase,
    isTest: options.isTest,
  });

  return engine.execute(workflow, options);
}

/**
 * Resume a waiting execution
 */
export async function resumeExecution(
  executionId: string
): Promise<ExecutionResult> {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Get execution data
  const { data: execution, error } = await supabase
    .from('automation_executions')
    .select('*, automations(*)')
    .eq('id', executionId)
    .single();

  if (error || !execution) {
    throw new Error(`Execution not found: ${executionId}`);
  }

  const automations = (execution as any).automations;

  // Get workflow
  const workflow: Workflow = {
    id: automations.id,
    name: automations.name,
    nodes: automations.nodes,
    edges: automations.edges,
    settings: automations.settings,
  };

  const engine = new ExecutionEngine({
    supabase,
    isTest: false,
  });

  const resumeData = (execution as any).resume_data;
  const waitingNodeId = resumeData?.waitingAt?.nodeId;

  // Find ALL next nodes after the waiting node (supports branching after delay).
  // Previously used .find() which only returned the first edge, silently
  // dropping parallel branches in patterns like delay → condition → two paths.
  let startFromNodeId: string | undefined;
  let resumeAfterNodeId: string | undefined;
  if (waitingNodeId) {
    const outEdges = (workflow.edges || []).filter((e: any) => e.source === waitingNodeId);
    if (outEdges.length === 1) {
      startFromNodeId = outEdges[0].target;
    } else if (outEdges.length > 1) {
      // Multiple outgoing edges = branching. Use resumeAfterNodeId so the
      // engine's reachability logic processes ALL downstream branches.
      resumeAfterNodeId = waitingNodeId;
    }
  }

  return engine.execute(workflow, {
    context: resumeData?.context,
    executionId,
    startFromNodeId,
    resumeAfterNodeId,
  });
}

/**
 * Test a workflow without persisting
 */
export async function testWorkflow(
  workflow: Workflow,
  triggerData: Record<string, any> = {}
): Promise<ExecutionResult> {
  return executeWorkflow(workflow, {
    isTest: true,
    context: {
      trigger: {
        type: 'test',
        data: triggerData,
        timestamp: new Date().toISOString(),
      },
    },
  });
}
