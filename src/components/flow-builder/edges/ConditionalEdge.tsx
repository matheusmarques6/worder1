'use client';

import { memo } from 'react';
import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath } from '@xyflow/react';

interface ConditionalEdgeProps {
  id: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  sourcePosition: any;
  targetPosition: any;
  sourceHandleId?: string | null;
  style?: React.CSSProperties;
  markerEnd?: string;
  selected?: boolean;
  data?: { label?: string };
}

function ConditionalEdgeComponent({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  sourceHandleId,
  style = {},
  markerEnd,
  selected,
  data,
}: ConditionalEdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  // Determine if this is a Yes/No path from a condition node
  const isYesPath = sourceHandleId === 'true' || sourceHandleId === 'yes' || sourceHandleId === 'sim';
  const isNoPath = sourceHandleId === 'false' || sourceHandleId === 'no' || sourceHandleId === 'nao';
  const isConditional = isYesPath || isNoPath;

  const edgeColor = isYesPath ? '#10b981' : isNoPath ? '#ef4444' : (selected ? '#3b82f6' : '#d1d5db');
  const label = data?.label || (isYesPath ? 'Sim' : isNoPath ? 'Não' : null);

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        markerEnd={markerEnd}
        style={{
          stroke: edgeColor,
          strokeWidth: selected ? 2.5 : isConditional ? 2 : 1.5,
          ...style,
        }}
      />
      {/* Label for conditional paths */}
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan"
          >
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${
                isYesPath
                  ? 'bg-green-50 text-green-700 border-green-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}
            >
              {label}
            </span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const ConditionalEdge = memo(ConditionalEdgeComponent);
export default ConditionalEdge;
