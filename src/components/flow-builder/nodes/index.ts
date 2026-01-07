// Export node components
export { BaseNode } from './BaseNode';
export { TriggerNode } from './TriggerNode';
export { ActionNode } from './ActionNode';
export { ConditionNode } from './ConditionNode';
export { ControlNode } from './ControlNode';

// Export node type definitions
export * from './nodeTypes';

// Import components for nodeTypes map
import { TriggerNode } from './TriggerNode';
import { ActionNode } from './ActionNode';
import { ConditionNode } from './ConditionNode';
import { ControlNode } from './ControlNode';

// ============================================
// REACT FLOW NODE TYPES MAP
// ============================================

export const nodeTypes = {
  // Triggers
  trigger_order: TriggerNode,
  trigger_order_paid: TriggerNode,
  trigger_abandon: TriggerNode,
  trigger_signup: TriggerNode,
  trigger_tag: TriggerNode,
  trigger_deal_created: TriggerNode,
  trigger_deal_stage: TriggerNode,
  trigger_deal_won: TriggerNode,
  trigger_deal_lost: TriggerNode,
  trigger_date: TriggerNode,
  trigger_segment: TriggerNode,
  trigger_webhook: TriggerNode,
  trigger_whatsapp: TriggerNode,
  
  // Actions
  action_email: ActionNode,
  action_whatsapp: ActionNode,
  action_sms: ActionNode,
  action_tag: ActionNode,
  action_remove_tag: ActionNode,
  action_update: ActionNode,
  action_create_deal: ActionNode,
  action_move_deal: ActionNode,
  action_assign_deal: ActionNode,
  action_notify: ActionNode,
  action_webhook: ActionNode,
  
  // Conditions
  condition_has_tag: ConditionNode,
  condition_field: ConditionNode,
  condition_deal_value: ConditionNode,
  condition_order_value: ConditionNode,
  logic_split: ConditionNode,
  logic_filter: ConditionNode,
  logic_condition: ConditionNode, // Legacy support
  
  // Control
  control_delay: ControlNode,
  control_delay_until: ControlNode,
  logic_delay: ControlNode, // Legacy support
};

export type NodeTypeKey = keyof typeof nodeTypes;
