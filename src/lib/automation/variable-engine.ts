/**
 * VARIABLE ENGINE
 * Process templates with dynamic variables and filters
 * 
 * Syntax: {{path.to.value}} or {{path.to.value | filter}}
 * 
 * Examples:
 * - {{contact.name}}
 * - {{order.total | currency}}
 * - {{trigger.data.email | lowercase}}
 * - {{nodes.node_123.output.result}}
 */

import { get, set, has } from 'lodash';

// ============================================
// TYPES
// ============================================

export interface VariableContext {
  trigger: {
    type: string;
    data: Record<string, any>;
    timestamp: string;
  };
  
  contact?: {
    id: string;
    email?: string;
    phone?: string;
    name?: string;
    firstName?: string;
    lastName?: string;
    tags: string[];
    customFields: Record<string, any>;
    createdAt: string;
    updatedAt?: string;
  };
  
  deal?: {
    id: string;
    title: string;
    value: number;
    currency?: string;
    stageId: string;
    stageName: string;
    pipelineId: string;
    pipelineName: string;
    contactId?: string;
    ownerId?: string;
    customFields: Record<string, any>;
    probability?: number;
    expectedCloseDate?: string;
    createdAt: string;
  };
  
  order?: {
    id: string;
    orderNumber: string;
    totalPrice: number;
    subtotalPrice: number;
    totalTax?: number;
    totalDiscounts?: number;
    currency: string;
    financialStatus?: string;
    fulfillmentStatus?: string;
    lineItems: Array<{
      id: string;
      title: string;
      quantity: number;
      price: number;
      sku?: string;
      variantTitle?: string;
    }>;
    customer: {
      id?: string;
      email: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
    };
    shippingAddress?: Record<string, any>;
    billingAddress?: Record<string, any>;
    createdAt: string;
  };
  
  nodes: {
    [nodeId: string]: {
      output: any;
      executedAt: string;
    };
  };
  
  workflow: {
    id: string;
    name: string;
    executionId: string;
  };
  
  now: {
    iso: string;
    timestamp: number;
    date: string;
    time: string;
    dayOfWeek: number;
    dayOfMonth: number;
    month: number;
    year: number;
  };
  
  env: {
    timezone: string;
    locale: string;
  };
  
  // Custom variables set during execution
  [key: string]: any;
}

export interface VariableSuggestion {
  path: string;
  label: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'date';
  description?: string;
  example?: string;
}

export type FilterFunction = (value: any, ...args: any[]) => any;

// ============================================
// BUILT-IN FILTERS
// ============================================

const FILTERS: Record<string, FilterFunction> = {
  // String filters
  uppercase: (value: any) => String(value).toUpperCase(),
  lowercase: (value: any) => String(value).toLowerCase(),
  capitalize: (value: any) => {
    const str = String(value);
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
  },
  titlecase: (value: any) => {
    return String(value)
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  },
  trim: (value: any) => String(value).trim(),
  truncate: (value: any, length: number = 50, suffix: string = '...') => {
    const str = String(value);
    return str.length > length ? str.substring(0, length) + suffix : str;
  },
  replace: (value: any, search: string, replacement: string) => {
    return String(value).replace(new RegExp(search, 'g'), replacement);
  },
  slug: (value: any) => {
    return String(value)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  },
  
  // Number filters
  number: (value: any, decimals: number = 0) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0' : num.toFixed(decimals);
  },
  currency: (value: any, currency: string = 'BRL', locale: string = 'pt-BR') => {
    const num = parseFloat(value);
    if (isNaN(num)) return 'R$ 0,00';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
    }).format(num);
  },
  percent: (value: any, decimals: number = 0) => {
    const num = parseFloat(value);
    return isNaN(num) ? '0%' : `${(num * 100).toFixed(decimals)}%`;
  },
  round: (value: any) => Math.round(parseFloat(value) || 0),
  floor: (value: any) => Math.floor(parseFloat(value) || 0),
  ceil: (value: any) => Math.ceil(parseFloat(value) || 0),
  abs: (value: any) => Math.abs(parseFloat(value) || 0),
  
  // Date filters
  date: (value: any, format: string = 'dd/MM/yyyy') => {
    try {
      const date = new Date(value);
      if (isNaN(date.getTime())) return value;
      
      const pad = (n: number) => n.toString().padStart(2, '0');
      
      const replacements: Record<string, string> = {
        'yyyy': date.getFullYear().toString(),
        'yy': date.getFullYear().toString().slice(-2),
        'MM': pad(date.getMonth() + 1),
        'M': (date.getMonth() + 1).toString(),
        'dd': pad(date.getDate()),
        'd': date.getDate().toString(),
        'HH': pad(date.getHours()),
        'H': date.getHours().toString(),
        'mm': pad(date.getMinutes()),
        'm': date.getMinutes().toString(),
        'ss': pad(date.getSeconds()),
        's': date.getSeconds().toString(),
      };
      
      let result = format;
      for (const [key, val] of Object.entries(replacements)) {
        result = result.replace(key, val);
      }
      return result;
    } catch {
      return value;
    }
  },
  datetime: (value: any) => {
    try {
      const date = new Date(value);
      return date.toLocaleString('pt-BR');
    } catch {
      return value;
    }
  },
  relative: (value: any) => {
    try {
      const date = new Date(value);
      const now = new Date();
      const diff = now.getTime() - date.getTime();
      
      const seconds = Math.floor(diff / 1000);
      const minutes = Math.floor(seconds / 60);
      const hours = Math.floor(minutes / 60);
      const days = Math.floor(hours / 24);
      
      if (days > 0) return `há ${days} dia${days > 1 ? 's' : ''}`;
      if (hours > 0) return `há ${hours} hora${hours > 1 ? 's' : ''}`;
      if (minutes > 0) return `há ${minutes} minuto${minutes > 1 ? 's' : ''}`;
      return 'agora';
    } catch {
      return value;
    }
  },
  
  // Array filters
  join: (value: any, separator: string = ', ') => {
    return Array.isArray(value) ? value.join(separator) : String(value);
  },
  first: (value: any) => Array.isArray(value) ? value[0] : value,
  last: (value: any) => Array.isArray(value) ? value[value.length - 1] : value,
  length: (value: any) => {
    if (Array.isArray(value)) return value.length;
    if (typeof value === 'string') return value.length;
    if (typeof value === 'object' && value !== null) return Object.keys(value).length;
    return 0;
  },
  reverse: (value: any) => {
    if (Array.isArray(value)) return [...value].reverse();
    if (typeof value === 'string') return value.split('').reverse().join('');
    return value;
  },
  sort: (value: any) => {
    if (Array.isArray(value)) return [...value].sort();
    return value;
  },
  unique: (value: any) => {
    if (Array.isArray(value)) return [...new Set(value)];
    return value;
  },
  
  // Object filters
  keys: (value: any) => {
    if (typeof value === 'object' && value !== null) return Object.keys(value);
    return [];
  },
  values: (value: any) => {
    if (typeof value === 'object' && value !== null) return Object.values(value);
    return [];
  },
  json: (value: any, pretty: boolean = false) => {
    try {
      return pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
    } catch {
      return String(value);
    }
  },
  
  // Conditional filters
  default: (value: any, defaultValue: any = '') => {
    if (value === null || value === undefined || value === '') {
      return defaultValue;
    }
    return value;
  },
  ifEmpty: (value: any, replacement: any) => {
    if (!value || (Array.isArray(value) && value.length === 0)) {
      return replacement;
    }
    return value;
  },
  
  // Encoding filters
  encodeUri: (value: any) => encodeURIComponent(String(value)),
  decodeUri: (value: any) => decodeURIComponent(String(value)),
  base64: (value: any) => Buffer.from(String(value)).toString('base64'),
  fromBase64: (value: any) => Buffer.from(String(value), 'base64').toString('utf8'),
  
  // Phone filter (Brazilian format)
  phone: (value: any) => {
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 7)}-${cleaned.slice(7)}`;
    }
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 2)}) ${cleaned.slice(2, 6)}-${cleaned.slice(6)}`;
    }
    return value;
  },
  
  // CPF/CNPJ filter
  cpf: (value: any) => {
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 11) {
      return `${cleaned.slice(0, 3)}.${cleaned.slice(3, 6)}.${cleaned.slice(6, 9)}-${cleaned.slice(9)}`;
    }
    return value;
  },
  cnpj: (value: any) => {
    const cleaned = String(value).replace(/\D/g, '');
    if (cleaned.length === 14) {
      return `${cleaned.slice(0, 2)}.${cleaned.slice(2, 5)}.${cleaned.slice(5, 8)}/${cleaned.slice(8, 12)}-${cleaned.slice(12)}`;
    }
    return value;
  },
};

// ============================================
// VARIABLE ENGINE CLASS
// ============================================

export class VariableEngine {
  private filters: Record<string, FilterFunction> = { ...FILTERS };

  /**
   * Register a custom filter
   */
  registerFilter(name: string, fn: FilterFunction): void {
    this.filters[name] = fn;
  }

  /**
   * Get all available filter names
   */
  getFilterNames(): string[] {
    return Object.keys(this.filters);
  }

  /**
   * Process a template string, replacing variables with values
   */
  process(template: string, context: Partial<VariableContext>): string {
    if (!template || typeof template !== 'string') {
      return String(template ?? '');
    }

    // Match {{variable}} or {{variable | filter}} or {{variable | filter:arg1:arg2}}
    const regex = /\{\{([^}]+)\}\}/g;
    
    return template.replace(regex, (match, expression) => {
      try {
        return this.evaluateExpression(expression.trim(), context);
      } catch (error) {
        console.warn(`Variable engine error for "${expression}":`, error);
        return match; // Return original if error
      }
    });
  }

  /**
   * Process an object recursively, replacing variables in all string values
   */
  processObject<T extends Record<string, any>>(obj: T, context: Partial<VariableContext>): T {
    if (typeof obj !== 'object' || obj === null) {
      return obj;
    }

    if (Array.isArray(obj)) {
      return obj.map(item => {
        if (typeof item === 'string') {
          return this.process(item, context);
        }
        if (typeof item === 'object' && item !== null) {
          return this.processObject(item, context);
        }
        return item;
      }) as unknown as T;
    }

    const result: Record<string, any> = {};
    
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        result[key] = this.process(value, context);
      } else if (typeof value === 'object' && value !== null) {
        result[key] = this.processObject(value, context);
      } else {
        result[key] = value;
      }
    }
    
    return result as T;
  }

  /**
   * Evaluate a single expression (path with optional filters)
   */
  private evaluateExpression(expression: string, context: Partial<VariableContext>): string {
    // Split by | for filters, but be careful with || in expressions
    const parts = expression.split(/\s*\|\s*(?![|])/);
    const path = parts[0].trim();
    const filterExpressions = parts.slice(1);

    // Get the value from context
    let value = this.getValue(path, context);

    // Apply filters
    for (const filterExpr of filterExpressions) {
      value = this.applyFilter(value, filterExpr.trim());
    }

    // Convert to string for template replacement
    if (value === null || value === undefined) {
      return '';
    }
    
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    
    return String(value);
  }

  /**
   * Get a value from context using dot notation path
   */
  private getValue(path: string, context: Partial<VariableContext>): any {
    // Handle special paths
    if (path === 'now') {
      return context.now?.iso || new Date().toISOString();
    }

    // Use lodash get for nested paths
    return get(context, path);
  }

  /**
   * Apply a filter to a value
   */
  private applyFilter(value: any, filterExpression: string): any {
    // Parse filter name and arguments
    // Format: filterName or filterName:arg1:arg2
    const colonIndex = filterExpression.indexOf(':');
    let filterName: string;
    let args: any[] = [];

    if (colonIndex === -1) {
      filterName = filterExpression;
    } else {
      filterName = filterExpression.substring(0, colonIndex);
      const argsStr = filterExpression.substring(colonIndex + 1);
      
      // Split arguments by colon, handling quoted strings
      args = this.parseFilterArgs(argsStr);
    }

    const filter = this.filters[filterName];
    
    if (!filter) {
      console.warn(`Unknown filter: ${filterName}`);
      return value;
    }

    return filter(value, ...args);
  }

  /**
   * Parse filter arguments, handling quoted strings
   */
  private parseFilterArgs(argsStr: string): any[] {
    const args: any[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < argsStr.length; i++) {
      const char = argsStr[i];

      if (!inQuote && (char === '"' || char === "'")) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote && char === ':') {
        args.push(this.parseArgValue(current.trim()));
        current = '';
      } else {
        current += char;
      }
    }

    if (current.trim()) {
      args.push(this.parseArgValue(current.trim()));
    }

    return args;
  }

  /**
   * Parse a single argument value (detect type)
   */
  private parseArgValue(value: string): any {
    // Remove surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      return value.slice(1, -1);
    }

    // Boolean
    if (value === 'true') return true;
    if (value === 'false') return false;

    // Number
    const num = parseFloat(value);
    if (!isNaN(num)) return num;

    return value;
  }

  /**
   * Extract all variable paths from a template
   */
  extractVariables(template: string): string[] {
    if (!template || typeof template !== 'string') {
      return [];
    }

    const regex = /\{\{([^|}]+)/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      const path = match[1].trim();
      if (!variables.includes(path)) {
        variables.push(path);
      }
    }

    return variables;
  }

  /**
   * Validate that all variables in a template exist in context
   */
  validateTemplate(template: string, context: Partial<VariableContext>): {
    valid: boolean;
    missingVariables: string[];
  } {
    const variables = this.extractVariables(template);
    const missingVariables: string[] = [];

    for (const variable of variables) {
      if (!has(context, variable) && variable !== 'now') {
        missingVariables.push(variable);
      }
    }

    return {
      valid: missingVariables.length === 0,
      missingVariables,
    };
  }

  /**
   * Get available variable suggestions for autocomplete
   */
  getAvailableVariables(context: Partial<VariableContext>): VariableSuggestion[] {
    const suggestions: VariableSuggestion[] = [];

    // Trigger variables
    if (context.trigger) {
      suggestions.push(
        { path: 'trigger.type', label: 'Tipo do Gatilho', type: 'string' },
        { path: 'trigger.timestamp', label: 'Data/Hora do Gatilho', type: 'date' },
      );
      
      // Add trigger data fields
      for (const key of Object.keys(context.trigger.data || {})) {
        suggestions.push({
          path: `trigger.data.${key}`,
          label: `Gatilho: ${key}`,
          type: this.detectType(context.trigger.data[key]),
        });
      }
    }

    // Contact variables
    if (context.contact) {
      suggestions.push(
        { path: 'contact.id', label: 'ID do Contato', type: 'string' },
        { path: 'contact.name', label: 'Nome do Contato', type: 'string' },
        { path: 'contact.firstName', label: 'Primeiro Nome', type: 'string' },
        { path: 'contact.lastName', label: 'Sobrenome', type: 'string' },
        { path: 'contact.email', label: 'Email', type: 'string' },
        { path: 'contact.phone', label: 'Telefone', type: 'string' },
        { path: 'contact.tags', label: 'Tags', type: 'array' },
      );
    }

    // Deal variables
    if (context.deal) {
      suggestions.push(
        { path: 'deal.id', label: 'ID do Deal', type: 'string' },
        { path: 'deal.title', label: 'Título do Deal', type: 'string' },
        { path: 'deal.value', label: 'Valor do Deal', type: 'number' },
        { path: 'deal.stageName', label: 'Estágio', type: 'string' },
        { path: 'deal.pipelineName', label: 'Pipeline', type: 'string' },
      );
    }

    // Order variables
    if (context.order) {
      suggestions.push(
        { path: 'order.id', label: 'ID do Pedido', type: 'string' },
        { path: 'order.orderNumber', label: 'Número do Pedido', type: 'string' },
        { path: 'order.totalPrice', label: 'Total do Pedido', type: 'number' },
        { path: 'order.currency', label: 'Moeda', type: 'string' },
        { path: 'order.financialStatus', label: 'Status Financeiro', type: 'string' },
        { path: 'order.customer.email', label: 'Email do Cliente', type: 'string' },
      );
    }

    // Node outputs
    for (const [nodeId, nodeData] of Object.entries(context.nodes || {})) {
      suggestions.push({
        path: `nodes.${nodeId}.output`,
        label: `Saída do nó ${nodeId}`,
        type: 'object',
      });
    }

    // Time variables
    suggestions.push(
      { path: 'now', label: 'Data/Hora Atual (ISO)', type: 'date' },
      { path: 'now.date', label: 'Data Atual', type: 'string' },
      { path: 'now.time', label: 'Hora Atual', type: 'string' },
      { path: 'now.dayOfWeek', label: 'Dia da Semana', type: 'number' },
    );

    // Workflow
    suggestions.push(
      { path: 'workflow.id', label: 'ID da Automação', type: 'string' },
      { path: 'workflow.name', label: 'Nome da Automação', type: 'string' },
      { path: 'workflow.executionId', label: 'ID da Execução', type: 'string' },
    );

    return suggestions;
  }

  /**
   * Detect the type of a value
   */
  private detectType(value: any): VariableSuggestion['type'] {
    if (value === null || value === undefined) return 'string';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (value instanceof Date) return 'date';
    if (typeof value === 'object') return 'object';
    return 'string';
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

export const variableEngine = new VariableEngine();

// ============================================
// HELPER FUNCTIONS
// ============================================

export function processTemplate(template: string, context: Partial<VariableContext>): string {
  return variableEngine.process(template, context);
}

export function processConfig<T extends Record<string, any>>(
  config: T, 
  context: Partial<VariableContext>
): T {
  return variableEngine.processObject(config, context);
}

export function createExecutionContext(options: {
  automationId: string;
  automationName: string;
  executionId: string;
  triggerType: string;
  triggerData: Record<string, any>;
  contact?: VariableContext['contact'];
  deal?: VariableContext['deal'];
  order?: VariableContext['order'];
  timezone?: string;
}): VariableContext {
  const now = new Date();
  
  return {
    trigger: {
      type: options.triggerType,
      data: options.triggerData,
      timestamp: now.toISOString(),
    },
    contact: options.contact,
    deal: options.deal,
    order: options.order,
    nodes: {},
    workflow: {
      id: options.automationId,
      name: options.automationName,
      executionId: options.executionId,
    },
    now: {
      iso: now.toISOString(),
      timestamp: now.getTime(),
      date: now.toISOString().split('T')[0],
      time: now.toTimeString().split(' ')[0],
      dayOfWeek: now.getDay(),
      dayOfMonth: now.getDate(),
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    },
    env: {
      timezone: options.timezone || 'America/Sao_Paulo',
      locale: 'pt-BR',
    },
  };
}
