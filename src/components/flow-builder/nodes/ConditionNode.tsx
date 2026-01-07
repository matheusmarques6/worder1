'use client';

import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { FlowNodeData } from '@/stores/flowStore';
import BaseNode from './BaseNode';
import { getNodeDefinition } from './nodeTypes';

export const ConditionNode = memo(function ConditionNode(props: NodeProps<FlowNodeData>) {
  const { data } = props;
  const definition = getNodeDefinition(data.nodeType);
  
  // Preview da condição configurada
  const conditionPreview = getConditionPreview(data);

  return (
    <BaseNode
      {...props}
      showTargetHandle={true}
      showSourceHandle={false}
      sourceHandles={[
        { id: 'true', label: 'Sim', color: 'green' },
        { id: 'false', label: 'Não', color: 'red' },
      ]}
    >
      {/* Preview da condição */}
      <div className="mt-2 space-y-2">
        {conditionPreview && (
          <p className="text-[11px] text-white/50 bg-white/5 px-2 py-1 rounded">
            {conditionPreview}
          </p>
        )}
        
        {/* Labels dos handles */}
        <div className="flex justify-end gap-3 text-[10px]">
          <span className="flex items-center gap-1 text-green-400">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Sim
          </span>
          <span className="flex items-center gap-1 text-red-400">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Não
          </span>
        </div>
      </div>
    </BaseNode>
  );
});

function getConditionPreview(data: FlowNodeData): string {
  const config = data.config;
  
  switch (data.nodeType) {
    case 'condition_has_tag':
      return config.tagName ? `Tem tag "${config.tagName}"?` : 'Configurar tag...';
    
    case 'condition_field':
      if (config.field && config.value) {
        const opLabel = getOperatorLabel(config.operator);
        return `${config.field} ${opLabel} "${config.value}"`;
      }
      return 'Configurar condição...';
    
    case 'condition_deal_value':
    case 'condition_order_value':
      if (config.value !== undefined) {
        const opLabel = getOperatorLabel(config.operator);
        return `Valor ${opLabel} R$ ${config.value}`;
      }
      return 'Configurar valor...';
    
    case 'logic_split':
      if (config.percentageA !== undefined) {
        return `A: ${config.percentageA}% / B: ${100 - config.percentageA}%`;
      }
      return '50% / 50%';
    
    default:
      return '';
  }
}

function getOperatorLabel(operator: string): string {
  const operators: Record<string, string> = {
    equals: '=',
    not_equals: '≠',
    contains: 'contém',
    not_contains: 'não contém',
    greater_than: '>',
    less_than: '<',
    greater_or_equal: '≥',
    less_or_equal: '≤',
    starts_with: 'começa com',
    ends_with: 'termina com',
  };
  return operators[operator] || operator;
}

export default ConditionNode;
