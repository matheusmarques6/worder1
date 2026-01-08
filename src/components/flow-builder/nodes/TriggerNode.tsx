'use client';

import { memo } from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';

function TriggerNodeComponent(props: BaseNodeProps) {
  return <BaseNode {...props} />;
}

export const TriggerNode = memo(TriggerNodeComponent);
export default TriggerNode;
