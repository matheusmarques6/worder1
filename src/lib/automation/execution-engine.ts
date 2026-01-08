/**
 * EXECUTION ENGINE - UPDATED VERSION
 * Core engine for executing automation workflows
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { VariableContext, variableEngine, createExecutionContext } from './variable-engine';
import { nodeExecutors, NodeExecutionResult } from './node-executors';

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
  triggerData?: Record<string, any>;
  contactId?: string;
  dealId?: string;
  orderId?: string;
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
    });

    // Ensure nodes object exists in context
    if (!context.nodes) {
      context.nodes = {};
    }

    try {
      // Build execution order
      const executionOrder = this.buildExecutionOrder(workflow);
      
      // Execute nodes in order
      for (const node of executionOrder) {
        // Skip if already processed (from branching)
        if (nodeResults[node.id]?.status === 'skipped') {
          continue;
        }

        const nodeStartTime = Date.now();

        try {
          // Get executor for this node type
          const nodeType = node.data.nodeType || node.type;
          const executor = nodeExecutors[nodeType];
          
          if (!executor) {
            console.warn(`No executor found for node type: ${nodeType}, using passthrough`);
            nodeResults[node.id] = {
              status: 'success',
              output: node.data.config,
              duration: Date.now() - nodeStartTime,
            };
            continue;
          }

          // Process config with variables
          const processedConfig = variableEngine.processObject(node.data.config, context);

          // Get credentials if needed
          let credentials = options.credentials?.[node.data.credentialId || ''];
          if (!credentials && node.data.credentialId) {
            credentials = await this.getCredentials(node.data.credentialId);
          }

          // Execute the node
          const result = await executor.execute({
            node,
            config: processedConfig,
            context,
            credentials,
            supabase: this.supabase,
            isTest: this.isTest,
          });

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
            return this.createResult(executionId, 'waiting', startedAt, nodeResults, context, {
              waitingAt: {
                nodeId: node.id,
                resumeAt: result.waitUntil,
                data: result.output,
              },
            });
          }

          // Handle branching (conditions)
          if (result.branch) {
            this.markSkippedBranches(workflow, node.id, result.branch, nodeResults);
          }

        } catch (nodeError: any) {
          nodeResults[node.id] = {
            status: 'error',
            output: null,
            error: nodeError.message,
            duration: Date.now() - nodeStartTime,
          };

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
        console.warn(`Credentials not found: ${credentialId}`);
        return {};
      }

      // Import dynamically to avoid circular dependencies
      const { decryptCredential } = await import('./credential-encryption');
      const decrypted = decryptCredential((data as any).encrypted_data);
      return { ...decrypted, type: (data as any).type };
    } catch (err) {
      console.error('Error getting credentials:', err);
      return {};
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

  // Resume from where we left off
  return engine.execute(workflow, {
    context: (execution as any).resume_data?.context,
    executionId,
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
