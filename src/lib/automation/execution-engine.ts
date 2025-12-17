// =============================================
// WORDER: Engine de Execução de Automações
// /src/lib/automation/execution-engine.ts
// =============================================

import { SupabaseClient } from '@supabase/supabase-js';
import { 
  ExecutionContext, 
  ContactData, 
  DealData, 
  NodeOutput,
  interpolateConfig,
  InterpolationWarning
} from './variables';

// =============================================
// TIPOS
// =============================================

export interface AutomationNode {
  id: string;
  type: string;
  data: {
    label?: string;
    config?: Record<string, any>;
  };
  position: { x: number; y: number };
}

export interface AutomationEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;  // 'true', 'false', 'A', 'B'
  targetHandle?: string;
}

export interface ExecutionRun {
  id: string;
  automation_id: string;
  organization_id: string;
  contact_id?: string;
  deal_id?: string;
  trigger_type: string;
  trigger_node_id: string;
  trigger_data: Record<string, any>;
  status: ExecutionStatus;
  nodes_total: number;
  nodes_executed: number;
  nodes_failed: number;
  nodes_skipped: number;
  error_node_id?: string;
  error_type?: string;
  error_message?: string;
  error_suggestion?: string;
  duration_ms?: number;
  started_at: string;
  completed_at?: string;
}

export interface ExecutionStep {
  id: string;
  run_id: string;
  node_id: string;
  node_type: string;
  node_label?: string;
  step_order: number;
  parent_step_id?: string;
  branch_path?: string;
  status: StepStatus;
  input_data: Record<string, any>;
  input_truncated: boolean;
  output_data: Record<string, any>;
  output_truncated: boolean;
  config_used: Record<string, any>;
  variables_resolved: Record<string, any>;
  error_type?: string;
  error_message?: string;
  error_stack?: string;
  error_context?: Record<string, any>;
  duration_ms?: number;
  started_at?: string;
  completed_at?: string;
}

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'timeout';
export type StepStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped' | 'timeout';

export interface ExecuteNodeFn {
  (
    organizationId: string,
    node: AutomationNode,
    config: Record<string, any>,
    context: ExecutionContext,
    supabase: SupabaseClient
  ): Promise<Record<string, any>>;
}

// =============================================
// CONSTANTES
// =============================================

const MAX_NODES_PER_RUN = 100;
const MAX_EXECUTION_TIME_MS = 5 * 60 * 1000; // 5 minutos
const MAX_DATA_SIZE = 10 * 1024; // 10KB

// Retenção por plano (dias)
const RETENTION_DAYS: Record<string, number> = {
  free: 7,
  starter: 30,
  growth: 90,
  enterprise: 365
};

// Sugestões de erro por tipo
const ERROR_SUGGESTIONS: Record<string, { suggestion: string; actionUrl?: string }> = {
  'KLAVIYO_401': {
    suggestion: 'Verifique sua API key em Configurações > Integrações > Klaviyo',
    actionUrl: '/settings/integrations/klaviyo'
  },
  'WHATSAPP_401': {
    suggestion: 'Verifique seu token de acesso em Configurações > Integrações > WhatsApp',
    actionUrl: '/settings/integrations/whatsapp'
  },
  'TWILIO_401': {
    suggestion: 'Verifique suas credenciais Twilio em Configurações > Integrações',
    actionUrl: '/settings/integrations'
  },
  'CONTACT_NOT_FOUND': {
    suggestion: 'Certifique-se de que o trigger está passando o contact_id corretamente'
  },
  'DEAL_NOT_FOUND': {
    suggestion: 'O deal pode ter sido excluído. Verifique se existe no CRM'
  },
  'PIPELINE_NOT_FOUND': {
    suggestion: 'A pipeline selecionada não existe. Selecione outra nas configurações do nó'
  },
  'VARIABLE_UNDEFINED': {
    suggestion: 'Use o seletor de variáveis para ver as opções disponíveis'
  },
  'TIMEOUT': {
    suggestion: 'A execução demorou demais. Tente simplificar a automação ou verificar integrações lentas'
  }
};

// Chaves sensíveis para redação
const SENSITIVE_KEYS = [
  'authorization', 'api_key', 'apiKey', 'api-key',
  'token', 'access_token', 'accessToken', 'refresh_token',
  'password', 'secret', 'credential', 'private_key', 'privateKey',
  'auth', 'bearer'
];

const PII_KEYS = ['email', 'phone', 'cpf', 'cnpj', 'card_number', 'ssn'];

// =============================================
// FUNÇÕES UTILITÁRIAS
// =============================================

/**
 * Remove dados sensíveis de um objeto
 */
export function redactSensitiveData(
  obj: any, 
  options: { redactPII?: boolean } = {}
): any {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') return obj;
  
  if (Array.isArray(obj)) {
    return obj.map((item: any) => redactSensitiveData(item, options));
  }
  
  const result: Record<string, any> = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = key.toLowerCase();
    
    // Redactar chaves sensíveis
    if (SENSITIVE_KEYS.some((k: string) => keyLower.includes(k))) {
      result[key] = '[REDACTED]';
      continue;
    }
    
    // Redactar PII se configurado
    if (options.redactPII && PII_KEYS.some((k: string) => keyLower.includes(k))) {
      if (typeof value === 'string') {
        // Mascarar parcialmente
        if (keyLower.includes('email') && value.includes('@')) {
          const [local, domain] = value.split('@');
          result[key] = `${local.slice(0, 2)}***@${domain}`;
        } else if (keyLower.includes('phone')) {
          result[key] = value.replace(/\d(?=\d{4})/g, '*');
        } else {
          result[key] = '[PII MASKED]';
        }
        continue;
      }
    }
    
    // Recursivo para objetos aninhados
    result[key] = redactSensitiveData(value, options);
  }
  
  return result;
}

/**
 * Trunca dados se exceder limite
 */
export function truncateData(
  data: any, 
  maxSize: number = MAX_DATA_SIZE
): { data: any; truncated: boolean } {
  const json = JSON.stringify(data);
  
  if (json.length <= maxSize) {
    return { data, truncated: false };
  }
  
  // Truncar e adicionar indicador
  const truncatedJson = json.slice(0, maxSize - 50);
  try {
    // Tentar manter JSON válido
    const parsed = JSON.parse(truncatedJson + '"}');
    return { 
      data: { 
        ...parsed, 
        __truncated: true, 
        __original_size: json.length 
      }, 
      truncated: true 
    };
  } catch {
    return { 
      data: { 
        __truncated: true, 
        __original_size: json.length,
        __preview: json.slice(0, 500) + '...'
      }, 
      truncated: true 
    };
  }
}

/**
 * Calcula a data de expiração baseado no plano
 */
export function calculateExpiresAt(plan: string = 'free'): Date {
  const days = RETENTION_DAYS[plan] || RETENTION_DAYS.free;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);
  return expires;
}

/**
 * Obtém sugestão de erro
 */
export function getErrorSuggestion(error: Error | string, context?: any): { type: string; suggestion: string; actionUrl?: string } {
  const errorMsg = typeof error === 'string' ? error : error.message;
  const errorLower = errorMsg.toLowerCase();
  
  // Detectar tipo de erro
  if (errorLower.includes('401') || errorLower.includes('unauthorized')) {
    if (errorLower.includes('klaviyo')) return { type: 'integration', ...ERROR_SUGGESTIONS['KLAVIYO_401'] };
    if (errorLower.includes('whatsapp')) return { type: 'integration', ...ERROR_SUGGESTIONS['WHATSAPP_401'] };
    if (errorLower.includes('twilio')) return { type: 'integration', ...ERROR_SUGGESTIONS['TWILIO_401'] };
    return { type: 'integration', suggestion: 'Verifique suas credenciais de integração' };
  }
  
  if (errorLower.includes('contact') && errorLower.includes('not found')) {
    return { type: 'data', ...ERROR_SUGGESTIONS['CONTACT_NOT_FOUND'] };
  }
  
  if (errorLower.includes('deal') && errorLower.includes('not found')) {
    return { type: 'data', ...ERROR_SUGGESTIONS['DEAL_NOT_FOUND'] };
  }
  
  if (errorLower.includes('pipeline') && errorLower.includes('not found')) {
    return { type: 'configuration', ...ERROR_SUGGESTIONS['PIPELINE_NOT_FOUND'] };
  }
  
  if (errorLower.includes('timeout')) {
    return { type: 'timeout', ...ERROR_SUGGESTIONS['TIMEOUT'] };
  }
  
  // Default
  return { 
    type: 'execution', 
    suggestion: 'Verifique os logs para mais detalhes ou entre em contato com o suporte' 
  };
}

// =============================================
// ENGINE DE EXECUÇÃO
// =============================================

export class AutomationExecutionEngine {
  private supabase: SupabaseClient;
  private nodeExecutors: Record<string, ExecuteNodeFn>;
  
  constructor(supabase: SupabaseClient, nodeExecutors: Record<string, ExecuteNodeFn>) {
    this.supabase = supabase;
    this.nodeExecutors = nodeExecutors;
  }
  
  /**
   * Executa uma automação completa
   */
  async execute(
    automation: {
      id: string;
      name: string;
      organization_id: string;
      nodes: AutomationNode[];
      edges: AutomationEdge[];
    },
    triggerData: {
      type: string;
      contact_id?: string;
      deal_id?: string;
      data: Record<string, any>;
    },
    options: {
      plan?: string;
      testMode?: boolean;
    } = {}
  ): Promise<{ runId: string; success: boolean; error?: string }> {
    const startTime = Date.now();
    
    // 1. Encontrar nó de trigger
    const triggerNode = automation.nodes.find((n: AutomationNode) => n.type?.startsWith('trigger_'));
    if (!triggerNode) {
      throw new Error('Automação sem nó de trigger');
    }
    
    // 2. Criar registro de execução
    const run = await this.createRun(automation, triggerData, triggerNode.id, options.plan);
    
    try {
      // 3. Carregar dados de contato e deal
      const contact = await this.loadContact(triggerData.contact_id);
      const deal = triggerData.deal_id ? await this.loadDeal(triggerData.deal_id) : undefined;
      
      // 4. Construir contexto inicial
      const context = this.buildInitialContext(run.id, automation, contact, deal, triggerData);
      
      // 5. Calcular grafo de dependências (DAG)
      const { dependencyCount, nodeChildren } = this.calculateDependencies(
        automation.nodes, 
        automation.edges
      );
      
      // 6. Executar em ordem topológica
      const readyQueue: string[] = [triggerNode.id];
      const executed = new Set<string>();
      let stepOrder = 0;
      let lastStepId: string | undefined;
      
      while (readyQueue.length > 0) {
        // Timeout check
        if (Date.now() - startTime > MAX_EXECUTION_TIME_MS) {
          throw new Error('Timeout: execução excedeu o limite de tempo');
        }
        
        // Max nodes check
        if (stepOrder >= MAX_NODES_PER_RUN) {
          throw new Error(`Limite de nós excedido (${MAX_NODES_PER_RUN})`);
        }
        
        const nodeId = readyQueue.shift()!;
        const node = automation.nodes.find((n: AutomationNode) => n.id === nodeId);
        
        if (!node || executed.has(nodeId)) continue;
        
        stepOrder++;
        executed.add(nodeId);
        
        // Executar nó
        const stepResult = await this.executeNode(
          run.id,
          automation.organization_id,
          node,
          context,
          stepOrder,
          lastStepId
        );
        
        lastStepId = stepResult.stepId;
        
        // Se erro, parar execução
        if (stepResult.status === 'error') {
          await this.finalizeRun(run.id, 'failed', {
            error_node_id: nodeId,
            error_type: stepResult.errorType,
            error_message: stepResult.errorMessage,
            error_suggestion: stepResult.errorSuggestion,
            nodes_executed: stepOrder,
            nodes_failed: 1,
            duration_ms: Date.now() - startTime
          });
          
          return { runId: run.id, success: false, error: stepResult.errorMessage };
        }
        
        // Se skip (filtro não passou), não seguir este branch
        if (stepResult.status === 'skipped') {
          continue;
        }
        
        // Encontrar próximos nós
        const nextNodes = this.getNextNodes(
          nodeId, 
          automation.edges, 
          stepResult.output,
          node.type
        );
        
        // Decrementar dependências e enfileirar prontos
        for (const nextId of nextNodes) {
          if (executed.has(nextId)) continue;
          
          const currentDeps = dependencyCount.get(nextId) || 0;
          dependencyCount.set(nextId, currentDeps - 1);
          
          if (dependencyCount.get(nextId)! <= 0) {
            readyQueue.push(nextId);
          }
        }
      }
      
      // 7. Finalizar com sucesso
      await this.finalizeRun(run.id, 'completed', {
        nodes_executed: stepOrder,
        nodes_failed: 0,
        duration_ms: Date.now() - startTime
      });
      
      return { runId: run.id, success: true };
      
    } catch (error: any) {
      // Erro não tratado
      const errorInfo = getErrorSuggestion(error);
      
      await this.finalizeRun(run.id, 'failed', {
        error_type: errorInfo.type,
        error_message: error.message,
        error_suggestion: errorInfo.suggestion,
        duration_ms: Date.now() - startTime
      });
      
      return { runId: run.id, success: false, error: error.message };
    }
  }
  
  /**
   * Cria registro de execução
   */
  private async createRun(
    automation: { id: string; organization_id: string; nodes: AutomationNode[] },
    triggerData: { type: string; contact_id?: string; deal_id?: string; data: Record<string, any> },
    triggerNodeId: string,
    plan?: string
  ): Promise<ExecutionRun> {
    const { data, error } = await this.supabase
      .from('automation_runs')
      .insert({
        automation_id: automation.id,
        organization_id: automation.organization_id,
        contact_id: triggerData.contact_id,
        deal_id: triggerData.deal_id,
        trigger_type: triggerData.type,
        trigger_node_id: triggerNodeId,
        trigger_data: redactSensitiveData(triggerData.data),
        status: 'running',
        nodes_total: automation.nodes.length,
        expires_at: calculateExpiresAt(plan)
      })
      .select()
      .single();
    
    if (error) throw new Error(`Erro ao criar run: ${error.message}`);
    return data as ExecutionRun;
  }
  
  /**
   * Finaliza execução
   */
  private async finalizeRun(
    runId: string, 
    status: ExecutionStatus,
    updates: Partial<ExecutionRun>
  ): Promise<void> {
    await this.supabase
      .from('automation_runs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        ...updates
      })
      .eq('id', runId);
  }
  
  /**
   * Carrega dados do contato
   */
  private async loadContact(contactId?: string): Promise<ContactData | undefined> {
    if (!contactId) return undefined;
    
    const { data } = await this.supabase
      .from('contacts')
      .select('*')
      .eq('id', contactId)
      .single();
    
    if (!data) return undefined;
    
    return {
      id: data.id,
      email: data.email || '',
      phone: data.phone || '',
      whatsapp: data.whatsapp || data.phone || '',
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      full_name: `${data.first_name || ''} ${data.last_name || ''}`.trim(),
      company: data.company || '',
      position: data.position || '',
      tags: data.tags || [],
      total_orders: data.total_orders || 0,
      total_spent: parseFloat(data.total_spent) || 0,
      created_at: data.created_at,
      updated_at: data.updated_at,
      custom_fields: data.custom_fields || {}
    };
  }
  
  /**
   * Carrega dados do deal
   */
  private async loadDeal(dealId: string): Promise<DealData | undefined> {
    const { data } = await this.supabase
      .from('deals')
      .select(`
        *,
        pipeline_stages(name),
        pipelines(name),
        profiles(full_name)
      `)
      .eq('id', dealId)
      .single();
    
    if (!data) return undefined;
    
    return {
      id: data.id,
      title: data.title,
      value: parseFloat(data.value) || 0,
      stage_id: data.stage_id,
      stage_name: data.pipeline_stages?.name || '',
      pipeline_id: data.pipeline_id,
      pipeline_name: data.pipelines?.name || '',
      assigned_to: data.assigned_to,
      assigned_to_name: data.profiles?.full_name || '',
      status: data.status,
      probability: data.probability,
      expected_close_date: data.expected_close_date,
      created_at: data.created_at
    };
  }
  
  /**
   * Constrói contexto inicial
   */
  private buildInitialContext(
    executionId: string,
    automation: { id: string; name: string; organization_id: string },
    contact: ContactData | undefined,
    deal: DealData | undefined,
    triggerData: { type: string; data: Record<string, any> }
  ): ExecutionContext {
    const now = new Date();
    
    return {
      execution_id: executionId,
      automation_id: automation.id,
      organization_id: automation.organization_id,
      
      contact: contact || {
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
      
      deal,
      
      trigger: {
        type: triggerData.type,
        node_id: '',
        data: triggerData.data
      },
      
      nodes: {},
      
      system: {
        current_date: now.toISOString().split('T')[0],
        current_time: now.toTimeString().split(' ')[0],
        current_datetime: now.toISOString(),
        automation_name: automation.name,
        execution_id: executionId,
        organization_id: automation.organization_id
      }
    };
  }
  
  /**
   * Calcula dependências do grafo (DAG)
   */
  private calculateDependencies(
    nodes: AutomationNode[],
    edges: AutomationEdge[]
  ): { 
    dependencyCount: Map<string, number>; 
    nodeChildren: Map<string, string[]> 
  } {
    const dependencyCount = new Map<string, number>();
    const nodeChildren = new Map<string, string[]>();
    
    // Inicializar todos os nós com 0 dependências
    for (const node of nodes) {
      dependencyCount.set(node.id, 0);
      nodeChildren.set(node.id, []);
    }
    
    // Contar dependências baseado nas edges
    for (const edge of edges) {
      const currentDeps = dependencyCount.get(edge.target) || 0;
      dependencyCount.set(edge.target, currentDeps + 1);
      
      const children = nodeChildren.get(edge.source) || [];
      children.push(edge.target);
      nodeChildren.set(edge.source, children);
    }
    
    return { dependencyCount, nodeChildren };
  }
  
  /**
   * Encontra próximos nós baseado no resultado
   */
  private getNextNodes(
    currentNodeId: string,
    edges: AutomationEdge[],
    output: Record<string, any>,
    nodeType: string
  ): string[] {
    const outgoingEdges = edges.filter((e: AutomationEdge) => e.source === currentNodeId);
    
    // Para nós de condição/split, filtrar por sourceHandle
    if (nodeType === 'logic_condition' || nodeType === 'logic_split') {
      const result = output.condition_result ?? output.branch_taken ?? output.variant;
      const expectedHandle = result === true || result === 'true' || result === 'A' ? 'true' : 'false';
      
      const matchingEdges = outgoingEdges.filter((e: AutomationEdge) => 
        e.sourceHandle === expectedHandle || 
        e.sourceHandle === (result === 'A' ? 'A' : 'B')
      );
      
      if (matchingEdges.length > 0) {
        return matchingEdges.map((e: AutomationEdge) => e.target);
      }
    }
    
    // Para filtros, só continua se passou
    if (nodeType === 'logic_filter' && !output.passed_filter) {
      return [];
    }
    
    return outgoingEdges.map((e: AutomationEdge) => e.target);
  }
  
  /**
   * Executa um nó individual
   */
  private async executeNode(
    runId: string,
    organizationId: string,
    node: AutomationNode,
    context: ExecutionContext,
    stepOrder: number,
    parentStepId?: string
  ): Promise<{
    stepId: string;
    status: StepStatus;
    output: Record<string, any>;
    errorType?: string;
    errorMessage?: string;
    errorSuggestion?: string;
  }> {
    const startTime = Date.now();
    
    // Criar step pendente
    const { data: step } = await this.supabase
      .from('automation_run_steps')
      .insert({
        run_id: runId,
        node_id: node.id,
        node_type: node.type,
        node_label: node.data?.label,
        step_order: stepOrder,
        parent_step_id: parentStepId,
        status: 'running',
        started_at: new Date().toISOString()
      })
      .select()
      .single();
    
    const stepId = step?.id;
    
    try {
      // Interpolar variáveis na config
      const config = node.data?.config || {};
      const { result: interpolatedConfig, warnings, variablesResolved } = interpolateConfig(config, context);
      
      // Preparar input para log
      const { data: inputData, truncated: inputTruncated } = truncateData(
        redactSensitiveData({ config: interpolatedConfig, context_summary: this.getContextSummary(context) })
      );
      
      // Executar nó
      const executor = this.nodeExecutors[node.type];
      if (!executor) {
        throw new Error(`Executor não encontrado para tipo: ${node.type}`);
      }
      
      const output = await executor(organizationId, node, interpolatedConfig, context, this.supabase);
      
      // Adicionar output ao contexto
      context.nodes[node.id] = {
        type: node.type,
        label: node.data?.label || node.type,
        status: 'success',
        output,
        executed_at: new Date().toISOString()
      };
      
      // Preparar output para log
      const { data: outputData, truncated: outputTruncated } = truncateData(
        redactSensitiveData(output)
      );
      
      // Atualizar step como sucesso
      await this.supabase
        .from('automation_run_steps')
        .update({
          status: 'success',
          input_data: inputData,
          input_truncated: inputTruncated,
          output_data: outputData,
          output_truncated: outputTruncated,
          config_used: redactSensitiveData(interpolatedConfig),
          variables_resolved: variablesResolved,
          duration_ms: Date.now() - startTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', stepId);
      
      // Checar se é filtro e não passou
      if (node.type === 'logic_filter' && !output.passed_filter) {
        return { stepId, status: 'skipped', output };
      }
      
      return { stepId, status: 'success', output };
      
    } catch (error: any) {
      const errorInfo = getErrorSuggestion(error);
      
      // Atualizar step como erro
      await this.supabase
        .from('automation_run_steps')
        .update({
          status: 'error',
          error_type: errorInfo.type,
          error_message: error.message,
          error_stack: error.stack?.slice(0, 5000),
          error_context: redactSensitiveData({ 
            node_config: node.data?.config,
            context_summary: this.getContextSummary(context)
          }),
          duration_ms: Date.now() - startTime,
          completed_at: new Date().toISOString()
        })
        .eq('id', stepId);
      
      return { 
        stepId, 
        status: 'error', 
        output: {},
        errorType: errorInfo.type,
        errorMessage: error.message,
        errorSuggestion: errorInfo.suggestion
      };
    }
  }
  
  /**
   * Resumo do contexto (para logs)
   */
  private getContextSummary(context: ExecutionContext): Record<string, any> {
    return {
      execution_id: context.execution_id,
      contact_id: context.contact?.id,
      contact_email: context.contact?.email,
      deal_id: context.deal?.id,
      trigger_type: context.trigger?.type,
      nodes_executed: Object.keys(context.nodes).length
    };
  }
}

// =============================================
// FACTORY
// =============================================

export function createExecutionEngine(
  supabase: SupabaseClient,
  nodeExecutors: Record<string, ExecuteNodeFn>
): AutomationExecutionEngine {
  return new AutomationExecutionEngine(supabase, nodeExecutors);
}
