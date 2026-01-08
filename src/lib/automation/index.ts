/**
 * AUTOMATION LIBRARY INDEX
 * Central exports for automation functionality
 */

// ============================================
// EXECUTION ENGINE
// ============================================
export {
  ExecutionEngine,
  executeWorkflow,
  resumeExecution,
  testWorkflow,
  type Workflow,
  type WorkflowNode,
  type WorkflowEdge,
  type ExecutionOptions,
  type ExecutionResult,
} from './execution-engine';

// ============================================
// NODE EXECUTORS
// ============================================
export {
  nodeExecutors,
  type NodeExecutor,
  type NodeExecutorContext,
  type NodeExecutionResult,
} from './node-executors';

// ============================================
// VARIABLE ENGINE
// ============================================
export {
  VariableEngine,
  variableEngine,
  processTemplate,
  processConfig,
  createExecutionContext,
  type VariableContext,
  type VariableSuggestion,
  type FilterFunction,
} from './variable-engine';

// ============================================
// CREDENTIAL ENCRYPTION
// ============================================
export {
  credentialEncryption,
  encryptCredential,
  decryptCredential,
  generateWebhookToken,
  generateWebhookSecret,
  verifyWebhookSignature,
  createWebhookSignature,
  maskSensitive,
  type EncryptedData,
} from './credential-encryption';

// ============================================
// LEGACY EXPORTS (for backwards compatibility)
// ============================================
export * from './variables';
export * from './actions';
