import { AnimatedEdge } from './AnimatedEdge';
import { ConditionalEdge } from './ConditionalEdge';

// Using 'any' to bypass strict typing issues with React Flow v12
export const edgeTypes: Record<string, any> = {
  animated: AnimatedEdge,
  conditional: ConditionalEdge,
  smoothstep: ConditionalEdge,
  default: ConditionalEdge,
};

export { AnimatedEdge, ConditionalEdge };
export default edgeTypes;
