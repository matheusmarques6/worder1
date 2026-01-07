'use client';

import { memo } from 'react';
import { NodeProps } from '@xyflow/react';
import { FlowNodeData } from '@/stores/flowStore';
import BaseNode from './BaseNode';

export const TriggerNode = memo(function TriggerNode(props: NodeProps) {
  return (
    <BaseNode
      {...props}
      data={props.data as FlowNodeData}
      showTargetHandle={false}
      showSourceHandle={true}
    />
  );
});

export default TriggerNode;
