'use client';

import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { FlowNodeData } from '@/stores/flowStore';
import BaseNode from './BaseNode';

export const TriggerNode = memo(function TriggerNode(props: NodeProps<FlowNodeData>) {
  return (
    <BaseNode
      {...props}
      showTargetHandle={false}
      showSourceHandle={true}
    />
  );
});

export default TriggerNode;
