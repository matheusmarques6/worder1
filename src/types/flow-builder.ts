/**
 * FLOW BUILDER TYPES
 * Complete TypeScript type definitions for the automation system
 */

// ============================================
// NODE TYPES
// ============================================

export type NodeCategory = 'trigger' | 'action' | 'condition' | 'control' | 'transform';

export type NodeStatus = 'idle' | 'running' | 'success' | 'error' | 'warning' | 'skipped';

export interface FlowNodePosition {
  x: number;
  y: number;
}

export interface FlowNodeData {
  label: string;
  description?: string;
  category: NodeCategory;
  nodeType: string;
  config: Record<string, any>;
  icon?: string;
  color?: string;
  credentialId?: string;
  disabled?: boolean;
  notes?: string;
  status?: NodeStatus;
  statusMessage?: string;
  executionTime?: number;
}

export interface FlowNode {
  id: string;
  type: string;
  position: FlowNodePosition;
  data: FlowNodeData;
  selected?: boolean;
  dragging?: boolean;
  width?: number;
  height?: number;
}

// ============================================
// EDGE TYPES
// ============================================

export interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type?: string;
  animated?: boolean;
  style?: Record<string, any>;
  label?: string;
  data?: Record<string, any>;
}

// ============================================
// AUTOMATION TYPES
// ============================================

export type AutomationStatus = 'draft' | 'active' | 'paused' | 'error' | 'archived';

export interface AutomationSettings {
  timezone?: string;
  errorHandling?: 'stop' | 'continue' | 'retry';
  maxRetries?: number;
  retryDelay?: number;
  rateLimit?: {
    max: number;
    per: 'second' | 'minute' | 'hour' | 'day';
  };
  dedupe?: {
    enabled: boolean;
    field: string;
    window: number; // minutes
  };
}

export interface Automation {
  id: string;
  organization_id: string;
  store_id?: string;
  name: string;
  description?: string;
  status: AutomationStatus;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: AutomationSettings;
  version: number;
  published_version?: number;
  static_data?: Record<string, any>;
  success_count: number;
  error_count: number;
  last_run_at?: string;
  last_error_at?: string;
  created_by?: string;
  created_at: string;
  updated_at: string;
}

// ============================================
// EXECUTION TYPES
// ============================================

export type ExecutionStatus = 'pending' | 'running' | 'success' | 'error' | 'waiting' | 'cancelled' | 'timeout';

export interface ExecutionStep {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  status: NodeStatus;
  startedAt: string;
  completedAt?: string;
  duration?: number;
  input?: any;
  output?: any;
  error?: string;
}

export interface AutomationExecution {
  id: string;
  automation_id: string;
  status: ExecutionStatus;
  triggered_by: string;
  trigger_data?: Record<string, any>;
  contact_id?: string;
  deal_id?: string;
  node_results?: Record<string, {
    status: NodeStatus;
    output?: any;
    error?: string;
    duration?: number;
  }>;
  final_context?: Record<string, any>;
  error_message?: string;
  error_node_id?: string;
  wait_till?: string;
  resume_data?: Record<string, any>;
  retry_of?: string;
  is_test: boolean;
  started_at: string;
  completed_at?: string;
}

// ============================================
// CREDENTIAL TYPES
// ============================================

export type CredentialType =
  | 'whatsappBusiness'
  | 'whatsappEvolution'
  | 'shopifyOAuth2'
  | 'emailResend'
  | 'emailSendgrid'
  | 'emailSmtp'
  | 'klaviyo'
  | 'httpBasicAuth'
  | 'httpBearerToken'
  | 'httpApiKey';

export interface Credential {
  id: string;
  organization_id: string;
  name: string;
  type: CredentialType;
  encrypted_data: string;
  oauth_token_data?: Record<string, any>;
  last_used_at?: string;
  last_test_at?: string;
  last_test_success?: boolean;
  automations_using?: string[];
  created_by?: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialTypeDefinition {
  type: CredentialType;
  name: string;
  icon: string;
  fields: string[];
  description?: string;
}

// ============================================
// WEBHOOK TYPES
// ============================================

export type WebhookStatus = 'active' | 'inactive' | 'error';

export interface FlowWebhook {
  id: string;
  automation_id: string;
  node_id: string;
  token: string;
  secret?: string;
  custom_path?: string;
  status: WebhookStatus;
  received_count: number;
  last_received_at?: string;
  created_at: string;
}

export interface WebhookLog {
  id: string;
  webhook_id: string;
  payload: Record<string, any>;
  headers: Record<string, string>;
  query_params?: Record<string, string>;
  ip_address?: string;
  processed: boolean;
  error_message?: string;
  created_at: string;
}

// ============================================
// TEMPLATE TYPES
// ============================================

export interface AutomationTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon?: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  settings?: AutomationSettings;
  required_credentials?: CredentialType[];
  is_featured: boolean;
  is_public: boolean;
  usage_count: number;
  created_at: string;
}

// ============================================
// VARIABLE TYPES
// ============================================

export type VariableType = 'string' | 'number' | 'boolean' | 'date' | 'array' | 'object';

export interface VariableSuggestion {
  path: string;
  label: string;
  type: VariableType;
  description?: string;
  example?: string;
}

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
  [key: string]: any;
}

// ============================================
// NODE DEFINITION TYPES
// ============================================

export interface NodeTypeDefinition {
  type: string;
  label: string;
  description: string;
  icon: string;
  category: NodeCategory;
  color: string;
  defaultConfig?: Record<string, any>;
  configSchema?: NodeConfigSchema;
  outputs?: NodeOutput[];
}

export interface NodeConfigSchema {
  fields: NodeConfigField[];
}

export interface NodeConfigField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'multiselect' | 'textarea' | 'toggle' | 'json' | 'credential' | 'variable';
  required?: boolean;
  placeholder?: string;
  defaultValue?: any;
  options?: Array<{ value: string; label: string }>;
  dependsOn?: { field: string; value: any };
  credentialType?: CredentialType;
  description?: string;
}

export interface NodeOutput {
  key: string;
  label: string;
  type: VariableType;
}

// ============================================
// EVENT TYPES
// ============================================

export type EventType =
  | 'order.created'
  | 'order.paid'
  | 'order.fulfilled'
  | 'order.cancelled'
  | 'order.refunded'
  | 'checkout.abandoned'
  | 'checkout.completed'
  | 'contact.created'
  | 'contact.updated'
  | 'contact.tag_added'
  | 'contact.tag_removed'
  | 'contact.segment_entered'
  | 'contact.segment_exited'
  | 'deal.created'
  | 'deal.updated'
  | 'deal.stage_changed'
  | 'deal.won'
  | 'deal.lost'
  | 'whatsapp.message_received'
  | 'whatsapp.message_sent'
  | 'webhook.received'
  | 'schedule.triggered'
  | `custom.${string}`;

export interface EventPayload {
  type: EventType;
  organizationId: string;
  storeId?: string;
  timestamp: string;
  data: Record<string, any>;
  metadata?: {
    source?: string;
    userId?: string;
    ip?: string;
    userAgent?: string;
  };
}

// ============================================
// UI STATE TYPES
// ============================================

export interface FlowBuilderState {
  // Automation metadata
  automationId: string | null;
  automationName: string;
  automationDescription?: string;
  automationStatus: AutomationStatus;
  
  // Graph data
  nodes: FlowNode[];
  edges: FlowEdge[];
  
  // Selection
  selectedNodeId: string | null;
  selectedEdgeId: string | null;
  
  // UI state
  showPropertiesPanel: boolean;
  showHistoryPanel: boolean;
  showTestModal: boolean;
  
  // Edit state
  isDirty: boolean;
  isSaving: boolean;
  lastSavedAt: string | null;
  
  // Undo/Redo
  past: Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>;
  future: Array<{ nodes: FlowNode[]; edges: FlowEdge[] }>;
  
  // Test execution
  testExecution: {
    isRunning: boolean;
    executionId?: string;
    triggerData?: Record<string, any>;
    steps: ExecutionStep[];
    currentNodeId?: string;
    totalDuration?: number;
    success?: boolean;
    error?: string;
  } | null;
}

// ============================================
// API RESPONSE TYPES
// ============================================

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// ============================================
// VALIDATION TYPES
// ============================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface NodeValidation {
  nodeId: string;
  valid: boolean;
  errors: string[];
  warnings: string[];
}
