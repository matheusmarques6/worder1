'use client';

import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { FlowNodeData } from '@/stores/flowStore';
import BaseNode from './BaseNode';

export const ActionNode = memo(function ActionNode(props: NodeProps<FlowNodeData>) {
  return (
    <BaseNode
      {...props}
      showTargetHandle={true}
      showSourceHandle={true}
    />
  );
});

export default ActionNode;
