// =============================================
// WORDER: Sistema de Variáveis e Interpolação
// /src/lib/automation/variables.ts
// =============================================

// =============================================
// TIPOS
// =============================================

export interface Variable {
  key: string;
  label: string;
  type: VariableType;
  format?: string;
  example?: any;
  description?: string;
}

export interface VariableCategory {
  id: string;
  label: string;
  icon: string;
  variables: Variable[];
  subcategories?: VariableCategory[];
}

export type VariableType = 'string' | 'number' | 'currency' | 'date' | 'datetime' | 'boolean' | 'array' | 'object';

export interface InterpolationResult {
  value: any;
  originalExpression: string;
  resolvedPath: string;
  formattersApplied: string[];
  warnings: InterpolationWarning[];
}

export interface InterpolationWarning {
  type: 'empty' | 'undefined' | 'type_mismatch' | 'formatter_error';
  message: string;
  path: string;
}

export interface ExecutionContext {
  execution_id: string;
  automation_id: string;
  organization_id: string;
  
  contact: ContactData;
  deal?: DealData;
  
  trigger: {
    type: string;
    node_id: string;
    data: Record<string, any>;
  };
  
  nodes: {
    [nodeId: string]: NodeOutput;
  };
  
  system: {
    current_date: string;
    current_time: string;
    current_datetime: string;
    automation_name: string;
    execution_id: string;
    organization_id: string;
  };
}

export interface ContactData {
  id: string;
  email: string;
  phone: string;
  whatsapp?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  company?: string;
  position?: string;
  tags: string[];
  total_orders: number;
  total_spent: number;
  created_at: string;
  updated_at?: string;
  custom_fields: Record<string, any>;
}

export interface DealData {
  id: string;
  title: string;
  value: number;
  stage_id: string;
  stage_name: string;
  pipeline_id: string;
  pipeline_name: string;
  assigned_to?: string;
  assigned_to_name?: string;
  status: string;
  probability?: number;
  expected_close_date?: string;
  created_at: string;
}

export interface NodeOutput {
  type: string;
  label: string;
  status: 'success' | 'error' | 'skipped';
  output: Record<string, any>;
  executed_at: string;
}

// =============================================
// CATÁLOGO BASE DE VARIÁVEIS
// =============================================

export const BASE_VARIABLES: VariableCategory[] = [
  {
    id: 'contact',
    label: 'Contato',
    icon: 'User',
    variables: [
      { key: 'contact.id', label: 'ID', type: 'string', example: 'c-123' },
      { key: 'contact.email', label: 'Email', type: 'string', example: 'joao@email.com' },
      { key: 'contact.phone', label: 'Telefone', type: 'string', example: '+5511999999999' },
      { key: 'contact.whatsapp', label: 'WhatsApp', type: 'string', example: '+5511999999999' },
      { key: 'contact.first_name', label: 'Primeiro Nome', type: 'string', example: 'João' },
      { key: 'contact.last_name', label: 'Sobrenome', type: 'string', example: 'Silva' },
      { key: 'contact.full_name', label: 'Nome Completo', type: 'string', example: 'João Silva' },
      { key: 'contact.company', label: 'Empresa', type: 'string', example: 'Acme Corp' },
      { key: 'contact.position', label: 'Cargo', type: 'string', example: 'Gerente' },
      { key: 'contact.tags', label: 'Tags', type: 'array', example: ['cliente', 'vip'] },
      { key: 'contact.total_orders', label: 'Total de Pedidos', type: 'number', example: 5 },
      { key: 'contact.total_spent', label: 'Total Gasto', type: 'currency', example: 1500.00 },
      { key: 'contact.created_at', label: 'Data de Cadastro', type: 'datetime', example: '2024-01-15T10:30:00Z' },
    ]
  },
  {
    id: 'deal',
    label: 'Deal',
    icon: 'DollarSign',
    variables: [
      { key: 'deal.id', label: 'ID', type: 'string', example: 'd-456' },
      { key: 'deal.title', label: 'Título', type: 'string', example: 'Venda Empresa X' },
      { key: 'deal.value', label: 'Valor', type: 'currency', example: 5000.00 },
      { key: 'deal.stage_id', label: 'ID do Estágio', type: 'string' },
      { key: 'deal.stage_name', label: 'Estágio', type: 'string', example: 'Negociação' },
      { key: 'deal.pipeline_id', label: 'ID da Pipeline', type: 'string' },
      { key: 'deal.pipeline_name', label: 'Pipeline', type: 'string', example: 'Vendas B2B' },
      { key: 'deal.assigned_to', label: 'Responsável (ID)', type: 'string' },
      { key: 'deal.assigned_to_name', label: 'Responsável', type: 'string', example: 'Maria Santos' },
      { key: 'deal.status', label: 'Status', type: 'string', example: 'open' },
      { key: 'deal.probability', label: 'Probabilidade (%)', type: 'number', example: 75 },
      { key: 'deal.created_at', label: 'Criado em', type: 'datetime' },
    ]
  },
  {
    id: 'system',
    label: 'Sistema',
    icon: 'Settings',
    variables: [
      { key: 'system.current_date', label: 'Data Atual', type: 'date', example: '2024-01-15' },
      { key: 'system.current_time', label: 'Hora Atual', type: 'string', example: '14:30:00' },
      { key: 'system.current_datetime', label: 'Data/Hora Atual', type: 'datetime' },
      { key: 'system.automation_name', label: 'Nome da Automação', type: 'string' },
      { key: 'system.execution_id', label: 'ID da Execução', type: 'string' },
    ]
  }
];

// Variáveis por tipo de trigger
export const TRIGGER_VARIABLES: Record<string, Variable[]> = {
  trigger_order: [
    { key: 'trigger.order_id', label: 'ID do Pedido', type: 'string', example: 'ORD-12345' },
    { key: 'trigger.order_value', label: 'Valor do Pedido', type: 'currency', example: 299.90 },
    { key: 'trigger.order_status', label: 'Status do Pedido', type: 'string', example: 'paid' },
    { key: 'trigger.order_date', label: 'Data do Pedido', type: 'datetime' },
    { key: 'trigger.products', label: 'Produtos', type: 'array' },
    { key: 'trigger.products_count', label: 'Qtd de Produtos', type: 'number', example: 3 },
  ],
  trigger_abandon: [
    { key: 'trigger.cart_id', label: 'ID do Carrinho', type: 'string', example: 'CART-789' },
    { key: 'trigger.cart_value', label: 'Valor do Carrinho', type: 'currency', example: 450.00 },
    { key: 'trigger.cart_url', label: 'URL do Carrinho', type: 'string' },
    { key: 'trigger.abandoned_at', label: 'Abandonado em', type: 'datetime' },
    { key: 'trigger.products', label: 'Produtos', type: 'array' },
  ],
  trigger_signup: [
    { key: 'trigger.signup_source', label: 'Origem', type: 'string', example: 'landing_page' },
    { key: 'trigger.signup_at', label: 'Data do Cadastro', type: 'datetime' },
    { key: 'trigger.form_data', label: 'Dados do Formulário', type: 'object' },
  ],
  trigger_tag: [
    { key: 'trigger.tag_name', label: 'Nome da Tag', type: 'string', example: 'cliente-vip' },
    { key: 'trigger.tag_action', label: 'Ação', type: 'string', example: 'added' },
    { key: 'trigger.previous_tags', label: 'Tags Anteriores', type: 'array' },
  ],
  trigger_deal_created: [
    { key: 'trigger.deal_id', label: 'ID do Deal', type: 'string' },
    { key: 'trigger.deal_title', label: 'Título', type: 'string' },
    { key: 'trigger.deal_value', label: 'Valor', type: 'currency' },
    { key: 'trigger.pipeline_name', label: 'Pipeline', type: 'string' },
    { key: 'trigger.stage_name', label: 'Estágio', type: 'string' },
  ],
  trigger_deal_moved: [
    { key: 'trigger.deal_id', label: 'ID do Deal', type: 'string' },
    { key: 'trigger.previous_stage_name', label: 'Estágio Anterior', type: 'string' },
    { key: 'trigger.new_stage_name', label: 'Novo Estágio', type: 'string' },
  ],
  trigger_date: [
    { key: 'trigger.triggered_date', label: 'Data do Disparo', type: 'date' },
    { key: 'trigger.field_matched', label: 'Campo Coincidente', type: 'string' },
    { key: 'trigger.field_value', label: 'Valor do Campo', type: 'string' },
  ],
  trigger_segment: [
    { key: 'trigger.segment_id', label: 'ID do Segmento', type: 'string' },
    { key: 'trigger.segment_name', label: 'Nome do Segmento', type: 'string' },
    { key: 'trigger.entered_at', label: 'Entrou em', type: 'datetime' },
  ],
  trigger_webhook: [
    { key: 'trigger.webhook_id', label: 'ID do Webhook', type: 'string' },
    { key: 'trigger.payload', label: 'Dados Recebidos', type: 'object' },
    { key: 'trigger.received_at', label: 'Recebido em', type: 'datetime' },
  ],
};

// =============================================
// FORMATTERS
// =============================================

type FormatterFn = (value: any, arg?: string) => any;

const FORMATTERS: Record<string, FormatterFn> = {
  // Texto
  uppercase: (v) => String(v ?? '').toUpperCase(),
  lowercase: (v) => String(v ?? '').toLowerCase(),
  capitalize: (v) => {
    const str = String(v ?? '');
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },
  titlecase: (v) => {
    return String(v ?? '').replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.slice(1).toLowerCase()
    );
  },
  trim: (v) => String(v ?? '').trim(),
  truncate: (v, arg) => {
    const len = parseInt(arg || '50', 10);
    const str = String(v ?? '');
    return str.length > len ? str.slice(0, len) + '...' : str;
  },
  
  // Números
  currency: (v) => {
    const num = parseFloat(v) || 0;
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: 'BRL' 
    }).format(num);
  },
  currency_usd: (v) => {
    const num = parseFloat(v) || 0;
    return new Intl.NumberFormat('en-US', { 
      style: 'currency', 
      currency: 'USD' 
    }).format(num);
  },
  number: (v) => {
    const num = parseFloat(v) || 0;
    return new Intl.NumberFormat('pt-BR').format(num);
  },
  percent: (v) => {
    const num = parseFloat(v) || 0;
    return `${num.toFixed(0)}%`;
  },
  round: (v, arg) => {
    const decimals = parseInt(arg || '0', 10);
    const num = parseFloat(v) || 0;
    return num.toFixed(decimals);
  },
  
  // Datas
  date_br: (v) => {
    try {
      return new Date(v).toLocaleDateString('pt-BR');
    } catch {
      return String(v ?? '');
    }
  },
  date_us: (v) => {
    try {
      return new Date(v).toLocaleDateString('en-US');
    } catch {
      return String(v ?? '');
    }
  },
  date_iso: (v) => {
    try {
      return new Date(v).toISOString().split('T')[0];
    } catch {
      return String(v ?? '');
    }
  },
  datetime_br: (v) => {
    try {
      return new Date(v).toLocaleString('pt-BR');
    } catch {
      return String(v ?? '');
    }
  },
  time: (v) => {
    try {
      return new Date(v).toLocaleTimeString('pt-BR', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
    } catch {
      return String(v ?? '');
    }
  },
  relative: (v) => {
    try {
      const date = new Date(v);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays === 0) return 'hoje';
      if (diffDays === 1) return 'ontem';
      if (diffDays < 7) return `${diffDays} dias atrás`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} semanas atrás`;
      if (diffDays < 365) return `${Math.floor(diffDays / 30)} meses atrás`;
      return `${Math.floor(diffDays / 365)} anos atrás`;
    } catch {
      return String(v ?? '');
    }
  },
  
  // Arrays
  json: (v) => {
    try {
      return JSON.stringify(v);
    } catch {
      return String(v ?? '');
    }
  },
  join: (v, arg) => {
    if (Array.isArray(v)) {
      return v.join(arg || ', ');
    }
    return String(v ?? '');
  },
  first: (v) => {
    if (Array.isArray(v)) return v[0];
    return v;
  },
  last: (v) => {
    if (Array.isArray(v)) return v[v.length - 1];
    return v;
  },
  count: (v) => {
    if (Array.isArray(v)) return v.length;
    if (typeof v === 'string') return v.length;
    return 0;
  },
  
  // Escapes
  url_encode: (v) => encodeURIComponent(String(v ?? '')),
  html_escape: (v) => {
    const str = String(v ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  base64: (v) => {
    try {
      return Buffer.from(String(v ?? '')).toString('base64');
    } catch {
      return String(v ?? '');
    }
  },
  
  // Default
  default: (v, arg) => {
    if (v === null || v === undefined || v === '') {
      return arg || '';
    }
    return v;
  },
};

// =============================================
// INTERPOLAÇÃO
// =============================================

/**
 * Resolve um path no contexto
 * Ex: "contact.first_name" -> "João"
 */
export function resolvePath(context: any, path: string): any {
  const parts = path.split('.');
  let current = context;
  
  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined;
    }
    
    // Suporte a array index: products[0]
    const arrayMatch = part.match(/^(\w+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, key, index] = arrayMatch;
      current = current[key];
      if (Array.isArray(current)) {
        current = current[parseInt(index, 10)];
      } else {
        return undefined;
      }
    } else {
      current = current[part];
    }
  }
  
  return current;
}

/**
 * Aplica um formatter ao valor
 */
export function applyFormatter(value: any, formatter: string): { value: any; error?: string } {
  // Parse: "truncate:50" -> name="truncate", arg="50"
  const colonIndex = formatter.indexOf(':');
  let name: string;
  let arg: string | undefined;
  
  if (colonIndex > -1) {
    name = formatter.slice(0, colonIndex).trim();
    arg = formatter.slice(colonIndex + 1).trim();
    // Remove aspas do arg se houver
    if ((arg.startsWith('"') && arg.endsWith('"')) || (arg.startsWith("'") && arg.endsWith("'"))) {
      arg = arg.slice(1, -1);
    }
  } else {
    name = formatter.trim();
  }
  
  const fn = FORMATTERS[name];
  if (!fn) {
    return { value, error: `Formatter desconhecido: ${name}` };
  }
  
  try {
    return { value: fn(value, arg) };
  } catch (error: any) {
    return { value, error: `Erro no formatter ${name}: ${error.message}` };
  }
}

/**
 * Interpola uma string com variáveis
 * Ex: "Olá {{contact.first_name | uppercase}}" -> "Olá JOÃO"
 */
export function interpolateString(
  template: string, 
  context: ExecutionContext
): { result: string; warnings: InterpolationWarning[] } {
  const warnings: InterpolationWarning[] = [];
  
  // Regex: {{path}} ou {{path | formatter1 | formatter2}}
  const regex = /\{\{([^}]+)\}\}/g;
  
  const result = template.replace(regex, (match, expression) => {
    const parts = expression.split('|').map((s: string) => s.trim());
    const path = parts[0];
    const formatters = parts.slice(1);
    
    // Resolver valor
    let value = resolvePath(context, path);
    
    // Warning se undefined
    if (value === undefined) {
      warnings.push({
        type: 'undefined',
        message: `Variável não encontrada: {{${path}}}`,
        path
      });
      // Checar se tem default
      const defaultFormatter = formatters.find((f: string) => f.startsWith('default'));
      if (!defaultFormatter) {
        return ''; // Retorna vazio se não tem default
      }
    }
    
    // Warning se vazio (mas não undefined)
    if (value === '' || value === null) {
      const hasDefault = formatters.some((f: string) => f.startsWith('default'));
      if (!hasDefault) {
        warnings.push({
          type: 'empty',
          message: `Variável vazia: {{${path}}}`,
          path
        });
      }
    }
    
    // Aplicar formatters
    for (const formatter of formatters) {
      const { value: newValue, error } = applyFormatter(value, formatter);
      value = newValue;
      if (error) {
        warnings.push({
          type: 'formatter_error',
          message: error,
          path
        });
      }
    }
    
    // Converter para string
    if (value === null || value === undefined) {
      return '';
    }
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return String(value);
  });
  
  return { result, warnings };
}

/**
 * Interpola todas as strings em um objeto de config
 */
export function interpolateConfig(
  config: any, 
  context: ExecutionContext
): { result: any; warnings: InterpolationWarning[]; variablesResolved: Record<string, any> } {
  const allWarnings: InterpolationWarning[] = [];
  const variablesResolved: Record<string, any> = {};
  
  function processValue(value: any, path: string): any {
    if (typeof value === 'string') {
      // Encontrar variáveis na string
      const matches = value.matchAll(/\{\{([^}|]+)/g);
      for (const match of matches) {
        const varPath = match[1].trim();
        variablesResolved[varPath] = resolvePath(context, varPath);
      }
      
      const { result, warnings } = interpolateString(value, context);
      allWarnings.push(...warnings);
      return result;
    }
    
    if (Array.isArray(value)) {
      return value.map((item: any, index: number) => processValue(item, `${path}[${index}]`));
    }
    
    if (value !== null && typeof value === 'object') {
      const result: Record<string, any> = {};
      for (const key of Object.keys(value)) {
        result[key] = processValue(value[key], `${path}.${key}`);
      }
      return result;
    }
    
    return value;
  }
  
  const result = processValue(config, 'config');
  
  return { result, warnings: allWarnings, variablesResolved };
}

// =============================================
// GERAÇÃO DE CATÁLOGO
// =============================================

/**
 * Gera o catálogo de variáveis disponíveis baseado no contexto
 */
export function generateVariableCatalog(
  triggerType: string,
  previousNodes: Array<{ id: string; type: string; label: string }>,
  nodeSchemas?: Record<string, any>
): VariableCategory[] {
  const catalog: VariableCategory[] = [...BASE_VARIABLES];
  
  // Adicionar variáveis do trigger
  const triggerVars = TRIGGER_VARIABLES[triggerType];
  if (triggerVars) {
    catalog.push({
      id: 'trigger',
      label: 'Gatilho',
      icon: 'Zap',
      variables: triggerVars
    });
  }
  
  // Adicionar variáveis de nós anteriores
  if (previousNodes.length > 0) {
    const nodesCategory: VariableCategory = {
      id: 'nodes',
      label: 'Nós Anteriores',
      icon: 'GitBranch',
      variables: [],
      subcategories: []
    };
    
    for (const node of previousNodes) {
      // Se temos schema, usar
      const schema = nodeSchemas?.[node.type]?.output_schema;
      
      if (schema?.properties) {
        const nodeVars: Variable[] = [];
        
        for (const [key, prop] of Object.entries(schema.properties as Record<string, any>)) {
          nodeVars.push({
            key: `nodes.${node.id}.output.${key}`,
            label: prop.label || key,
            type: prop.type as VariableType || 'string',
            format: prop.format,
            example: prop.example
          });
        }
        
        if (nodeVars.length > 0) {
          nodesCategory.subcategories!.push({
            id: `node_${node.id}`,
            label: node.label || node.type,
            icon: 'Box',
            variables: nodeVars
          });
        }
      } else {
        // Fallback: variáveis genéricas
        nodesCategory.subcategories!.push({
          id: `node_${node.id}`,
          label: node.label || node.type,
          icon: 'Box',
          variables: [
            { key: `nodes.${node.id}.output`, label: 'Output completo', type: 'object' },
            { key: `nodes.${node.id}.status`, label: 'Status', type: 'string' }
          ]
        });
      }
    }
    
    if (nodesCategory.subcategories!.length > 0) {
      catalog.push(nodesCategory);
    }
  }
  
  return catalog;
}

// =============================================
// SAMPLE CONTEXT (para preview)
// =============================================

export function createSampleContext(triggerType: string): ExecutionContext {
  const now = new Date();
  
  return {
    execution_id: 'sample-exec-123',
    automation_id: 'sample-auto-456',
    organization_id: 'sample-org-789',
    
    contact: {
      id: 'sample-contact-abc',
      email: 'joao.silva@email.com',
      phone: '+5511999999999',
      whatsapp: '+5511999999999',
      first_name: 'João',
      last_name: 'Silva',
      full_name: 'João Silva',
      company: 'Acme Corp',
      position: 'Gerente de Vendas',
      tags: ['cliente', 'vip', 'b2b'],
      total_orders: 5,
      total_spent: 1500.00,
      created_at: '2024-01-15T10:30:00Z',
      custom_fields: {
        origem: 'Google Ads',
        interesse: 'Produto Premium'
      }
    },
    
    deal: {
      id: 'sample-deal-def',
      title: 'Venda Empresa X',
      value: 5000.00,
      stage_id: 'stage-123',
      stage_name: 'Negociação',
      pipeline_id: 'pipe-456',
      pipeline_name: 'Vendas B2B',
      assigned_to: 'user-789',
      assigned_to_name: 'Maria Santos',
      status: 'open',
      probability: 75,
      created_at: '2024-01-20T14:00:00Z'
    },
    
    trigger: {
      type: triggerType,
      node_id: 'trigger-node-1',
      data: getSampleTriggerData(triggerType)
    },
    
    nodes: {},
    
    system: {
      current_date: now.toISOString().split('T')[0],
      current_time: now.toTimeString().split(' ')[0],
      current_datetime: now.toISOString(),
      automation_name: 'Automação de Exemplo',
      execution_id: 'sample-exec-123',
      organization_id: 'sample-org-789'
    }
  };
}

function getSampleTriggerData(triggerType: string): Record<string, any> {
  switch (triggerType) {
    case 'trigger_order':
      return {
        order_id: 'ORD-12345',
        order_value: 299.90,
        order_status: 'paid',
        order_date: new Date().toISOString(),
        products: [
          { id: 'prod-1', name: 'Camiseta', quantity: 2, price: 79.90 },
          { id: 'prod-2', name: 'Calça', quantity: 1, price: 140.10 }
        ],
        products_count: 3
      };
    
    case 'trigger_abandon':
      return {
        cart_id: 'CART-789',
        cart_value: 450.00,
        cart_url: 'https://loja.com/cart/abc123',
        abandoned_at: new Date().toISOString(),
        products: [
          { id: 'prod-3', name: 'Tênis', quantity: 1, price: 450.00 }
        ]
      };
    
    case 'trigger_signup':
      return {
        signup_source: 'landing_page',
        signup_at: new Date().toISOString(),
        form_data: { newsletter: true }
      };
    
    case 'trigger_tag':
      return {
        tag_name: 'cliente-vip',
        tag_action: 'added',
        previous_tags: ['cliente']
      };
    
    case 'trigger_deal_created':
      return {
        deal_id: 'deal-new-123',
        deal_title: 'Novo Deal',
        deal_value: 3000.00,
        pipeline_name: 'Vendas',
        stage_name: 'Qualificação'
      };
    
    default:
      return {};
  }
}

// =============================================
// EXPORT FORMATTERS (BASE_VARIABLES e TRIGGER_VARIABLES já exportados acima)
// =============================================

export { FORMATTERS };
