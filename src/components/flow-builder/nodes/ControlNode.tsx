'use client';

import { memo } from 'react';
import { BaseNode, BaseNodeProps } from './BaseNode';

function ControlNodeComponent(props: BaseNodeProps) {
  return <BaseNode {...props} />;
}

export const ControlNode = memo(ControlNodeComponent);
export default ControlNode;
