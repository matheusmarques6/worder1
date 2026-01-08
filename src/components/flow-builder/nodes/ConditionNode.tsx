'use client';

import { memo } from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';

function ConditionNodeComponent(props: BaseNodeProps) {
  return <BaseNode {...props} />;
}

export const ConditionNode = memo(ConditionNodeComponent);
export default ConditionNode;
