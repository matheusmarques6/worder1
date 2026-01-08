import { AnimatedEdge } from './AnimatedEdge';

// Using 'any' to bypass strict typing issues with React Flow v12
export const edgeTypes: Record<string, any> = {
  animated: AnimatedEdge,
  default: AnimatedEdge,
};

export { AnimatedEdge };
export default edgeTypes;
