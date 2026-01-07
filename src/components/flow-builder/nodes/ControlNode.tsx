'use client';

import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { FlowNodeData } from '@/stores/flowStore';
import BaseNode from './BaseNode';

export const ControlNode = memo(function ControlNode(props: NodeProps<FlowNodeData>) {
  const { data } = props;
  
  // Preview do delay
  const delayPreview = getDelayPreview(data);

  return (
    <BaseNode
      {...props}
      showTargetHandle={true}
      showSourceHandle={true}
    >
      {delayPreview && (
        <div className="mt-2">
          <p className="text-[11px] text-white/50 bg-white/5 px-2 py-1 rounded text-center">
            {delayPreview}
          </p>
        </div>
      )}
    </BaseNode>
  );
});

function getDelayPreview(data: FlowNodeData): string {
  const config = data.config;
  
  switch (data.nodeType) {
    case 'control_delay':
      if (config.value !== undefined && config.unit) {
        const unitLabels: Record<string, string> = {
          minutes: 'minutos',
          hours: 'horas',
          days: 'dias',
        };
        return `Aguardar ${config.value} ${unitLabels[config.unit] || config.unit}`;
      }
      return 'Configurar tempo...';
    
    case 'control_delay_until':
      if (config.datetime) {
        return `Até ${new Date(config.datetime).toLocaleString('pt-BR')}`;
      }
      return 'Configurar data...';
    
    default:
      return '';
  }
}

export default ControlNode;
