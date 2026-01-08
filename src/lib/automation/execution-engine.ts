/**
 * EXECUTION ENGINE
 * Core engine for executing automation workflows
 */

import { createClient } from '@supabase/supabase-js';
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
  name: string;
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
  triggerData?: Record<string, any>;
  contactId?: string;
  dealId?: string;
  orderId?: string;
  startFromNodeId?: string;
  resumeData?: {
    nodeId: string;
    context: Partial<VariableContext>;
  };
}

export interface ExecutionResult {
  executionId: string;
  status: 'success' | 'error' | 'waiting' | 'cancelled';
  startedAt: Date;
  completedAt?: Date;
  duration?: number;
  nodeResults: Record<string, NodeExecutionResult>;
  finalContext: Partial<VariableContext>;
  error?: {
    nodeId: string;
    message: string;
    stack?: string;
  };
  waitingAt?: {
    nodeId: string;
    resumeAt: Date;
    data: any;
  };
}

// ============================================
// EXECUTION ENGINE CLASS
// ============================================

export class ExecutionEngine {
  private supabase: ReturnType<typeof createClient>;
  private workflow: Workflow;
  private context: VariableContext;
  private nodeResults: Record<string, NodeExecutionResult> = {};
  private executionId: string;
  private isTest: boolean;
  private aborted: boolean = false;

  constructor(
    workflow: Workflow,
    supabaseUrl: string,
    supabaseKey: string,
    options: ExecutionOptions = {}
  ) {
    this.workflow = workflow;
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.executionId = options.resumeData ? 
      `resume_${Date.now()}` : 
      `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.isTest = options.isTest || false;

    // Initialize context
    const triggerNode = this.findTriggerNode();
    
    this.context = options.resumeData?.context as VariableContext || createExecutionContext({
      automationId: workflow.id,
      automationName: workflow.name,
      executionId: this.executionId,
      triggerType: triggerNode?.data.nodeType || 'manual',
      triggerData: options.triggerData || {},
      timezone: workflow.settings?.timezone,
    });
  }

  /**
   * Execute the workflow
   */
  async execute(): Promise<ExecutionResult> {
    const startedAt = new Date();
    
    try {
      // Log execution start
      if (!this.isTest) {
        await this.logExecutionStart();
      }

      // Build execution graph
      const executionOrder = this.buildExecutionOrder();
      
      // Execute nodes in order
      for (const node of executionOrder) {
        if (this.aborted) {
          break;
        }

        // Skip if already processed (from branching)
        if (this.nodeResults[node.id]?.status === 'skipped') {
          continue;
        }

        const result = await this.executeNode(node);
        this.nodeResults[node.id] = result;

        // Update context with node output
        this.context.nodes[node.id] = {
          output: result.output,
          executedAt: new Date().toISOString(),
        };

        // Handle special results
        if (result.status === 'error' && this.workflow.settings?.errorHandling === 'stop') {
          throw new Error(result.error || 'Node execution failed');
        }

        if (result.status === 'waiting') {
          // Schedule resume
          if (!this.isTest && result.waitUntil) {
            await this.scheduleResume(node.id, result.waitUntil, result.output);
          }
          
          return this.createResult('waiting', startedAt, {
            waitingAt: {
              nodeId: node.id,
              resumeAt: result.waitUntil!,
              data: result.output,
            },
          });
        }

        // Handle branching (conditions)
        if (result.branch) {
          this.markSkippedBranches(node.id, result.branch);
        }
      }

      // Log execution complete
      if (!this.isTest) {
        await this.logExecutionComplete('success');
      }

      return this.createResult('success', startedAt);

    } catch (error: any) {
      console.error('Execution error:', error);
      
      // Log execution error
      if (!this.isTest) {
        await this.logExecutionComplete('error', error.message);
      }

      return this.createResult('error', startedAt, {
        error: {
          nodeId: this.findErrorNodeId(),
          message: error.message,
          stack: error.stack,
        },
      });
    }
  }

  /**
   * Execute a single node
   */
  private async executeNode(node: WorkflowNode): Promise<NodeExecutionResult> {
    const startTime = Date.now();
    
    try {
      // Get executor for this node type
      const executor = nodeExecutors[node.data.nodeType];
      
      if (!executor) {
        // Use default passthrough for unknown types
        console.warn(`No executor found for node type: ${node.data.nodeType}, using passthrough`);
        return {
          status: 'success',
          output: node.data.config,
          duration: Date.now() - startTime,
        };
      }

      // Process config with variables
      const processedConfig = variableEngine.processObject(node.data.config, this.context);

      // Get credentials if needed
      let credentials: Record<string, any> | undefined;
      if (node.data.credentialId) {
        credentials = await this.getCredentials(node.data.credentialId);
      }

      // Execute the node
      const result = await executor.execute({
        node,
        config: processedConfig,
        context: this.context,
        credentials,
        supabase: this.supabase,
        isTest: this.isTest,
      });

      return {
        ...result,
        duration: Date.now() - startTime,
      };

    } catch (error: any) {
      return {
        status: 'error',
        error: error.message,
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Build execution order using topological sort
   */
  private buildExecutionOrder(): WorkflowNode[] {
    const { nodes, edges } = this.workflow;
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
  private markSkippedBranches(nodeId: string, selectedBranch: string): void {
    // Find all edges from this node
    const nodeEdges = this.workflow.edges.filter(e => e.source === nodeId);
    
    // Find targets that should be skipped (other branches)
    const skippedTargets = new Set<string>();
    
    for (const edge of nodeEdges) {
      if (edge.sourceHandle !== selectedBranch) {
        skippedTargets.add(edge.target);
        // Also skip all descendants of skipped targets
        this.collectDescendants(edge.target, skippedTargets);
      }
    }

    // Mark as skipped
    for (const targetId of skippedTargets) {
      if (!this.nodeResults[targetId]) {
        this.nodeResults[targetId] = {
          status: 'skipped',
          output: null,
          duration: 0,
        };
      }
    }
  }

  /**
   * Collect all descendant nodes
   */
  private collectDescendants(nodeId: string, collected: Set<string>): void {
    const edges = this.workflow.edges.filter(e => e.source === nodeId);
    
    for (const edge of edges) {
      if (!collected.has(edge.target)) {
        collected.add(edge.target);
        this.collectDescendants(edge.target, collected);
      }
    }
  }

  /**
   * Find the trigger node
   */
  private findTriggerNode(): WorkflowNode | undefined {
    return this.workflow.nodes.find(n => n.data.category === 'trigger');
  }

  /**
   * Find the node that caused an error
   */
  private findErrorNodeId(): string {
    const errorNode = Object.entries(this.nodeResults).find(
      ([_, result]) => result.status === 'error'
    );
    return errorNode?.[0] || 'unknown';
  }

  /**
   * Get decrypted credentials
   */
  private async getCredentials(credentialId: string): Promise<Record<string, any>> {
    const { data, error } = await this.supabase
      .from('credentials')
      .select('encrypted_data')
      .eq('id', credentialId)
      .single();

    if (error || !data) {
      throw new Error(`Credentials not found: ${credentialId}`);
    }

    // Import dynamically to avoid circular dependencies
    const { decryptCredential } = await import('./credential-encryption');
    return decryptCredential(data.encrypted_data);
  }

  /**
   * Log execution start to database
   */
  private async logExecutionStart(): Promise<void> {
    const triggerNode = this.findTriggerNode();
    
    await this.supabase.from('automation_executions').insert({
      id: this.executionId,
      automation_id: this.workflow.id,
      status: 'running',
      triggered_by: triggerNode?.data.nodeType || 'manual',
      trigger_data: this.context.trigger.data,
      contact_id: this.context.contact?.id,
      deal_id: this.context.deal?.id,
      started_at: new Date().toISOString(),
      is_test: this.isTest,
    });
  }

  /**
   * Log execution complete to database
   */
  private async logExecutionComplete(status: 'success' | 'error', errorMessage?: string): Promise<void> {
    await this.supabase
      .from('automation_executions')
      .update({
        status,
        completed_at: new Date().toISOString(),
        node_results: this.nodeResults,
        final_context: this.context,
        error_message: errorMessage,
        error_node_id: status === 'error' ? this.findErrorNodeId() : null,
      })
      .eq('id', this.executionId);
  }

  /**
   * Schedule a resume for delayed execution
   */
  private async scheduleResume(nodeId: string, resumeAt: Date, data: any): Promise<void> {
    // Update execution with wait data
    await this.supabase
      .from('automation_executions')
      .update({
        status: 'waiting',
        wait_till: resumeAt.toISOString(),
        resume_data: {
          nodeId,
          context: this.context,
          data,
        },
      })
      .eq('id', this.executionId);

    // If using QStash, schedule the resume
    if (process.env.QSTASH_URL && process.env.QSTASH_TOKEN) {
      const delay = Math.max(0, resumeAt.getTime() - Date.now());
      
      await fetch(`${process.env.QSTASH_URL}/v2/publish/${process.env.NEXT_PUBLIC_APP_URL}/api/workers/automation`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.QSTASH_TOKEN}`,
          'Content-Type': 'application/json',
          'Upstash-Delay': `${Math.floor(delay / 1000)}s`,
        },
        body: JSON.stringify({
          action: 'resume',
          executionId: this.executionId,
          automationId: this.workflow.id,
        }),
      });
    }
  }

  /**
   * Create execution result
   */
  private createResult(
    status: ExecutionResult['status'],
    startedAt: Date,
    extra: Partial<ExecutionResult> = {}
  ): ExecutionResult {
    const completedAt = status !== 'waiting' ? new Date() : undefined;
    
    return {
      executionId: this.executionId,
      status,
      startedAt,
      completedAt,
      duration: completedAt ? completedAt.getTime() - startedAt.getTime() : undefined,
      nodeResults: this.nodeResults,
      finalContext: this.context,
      ...extra,
    };
  }

  /**
   * Abort execution
   */
  abort(): void {
    this.aborted = true;
  }

  /**
   * Get current context
   */
  getContext(): VariableContext {
    return this.context;
  }

  /**
   * Get execution ID
   */
  getExecutionId(): string {
    return this.executionId;
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
  options: ExecutionOptions = {}
): Promise<ExecutionResult> {
  const engine = new ExecutionEngine(
    workflow,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    options
  );

  return engine.execute();
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

  // Get workflow
  const workflow: Workflow = {
    id: execution.automations.id,
    name: execution.automations.name,
    nodes: execution.automations.nodes,
    edges: execution.automations.edges,
    settings: execution.automations.settings,
  };

  // Resume from where we left off
  const engine = new ExecutionEngine(
    workflow,
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      resumeData: execution.resume_data,
    }
  );

  return engine.execute();
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
    triggerData,
  });
}
