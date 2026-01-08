'use client';

import { memo } from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';

function ActionNodeComponent(props: BaseNodeProps) {
  return <BaseNode {...props} />;
}

export const ActionNode = memo(ActionNodeComponent);
export default ActionNode;
