'use client';

import { memo } from 'react';
import { EdgeProps, getSmoothStepPath, EdgeLabelRenderer } from '@xyflow/react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { NodeStatus } from '@/stores/flowStore';

interface AnimatedEdgeData extends Record<string, unknown> {
  status?: NodeStatus;
  label?: string;
}

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
  selected,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 8,
  });

  const edgeData = data as AnimatedEdgeData | undefined;
  const status = edgeData?.status || 'idle';
  
  const strokeColor = {
    idle: '#4b5563',
    running: '#3b82f6',
    success: '#22c55e',
    error: '#ef4444',
    warning: '#f59e0b',
    skipped: '#6b7280',
  }[status];

  return (
    <>
      {/* Main edge path */}
      <motion.path
        id={id}
        className="react-flow__edge-path"
        d={edgePath}
        fill="none"
        strokeWidth={selected ? 3 : 2}
        markerEnd={markerEnd}
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ 
          pathLength: 1,
          opacity: 1,
          stroke: strokeColor,
        }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      />

      {/* Flow animation when running */}
      {status === 'running' && (
        <motion.path
          d={edgePath}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={2}
          strokeDasharray="6 6"
          initial={{ strokeDashoffset: 12 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ 
            duration: 0.4, 
            repeat: Infinity, 
            ease: 'linear' 
          }}
        />
      )}

      {/* Glow effect on success/error */}
      {(status === 'success' || status === 'error') && (
        <motion.path
          d={edgePath}
          fill="none"
          stroke={strokeColor}
          strokeWidth={6}
          strokeOpacity={0.3}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1 }}
        />
      )}

      {/* Label */}
      {edgeData?.label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={cn(
              'px-2 py-0.5 rounded text-[10px]',
              'bg-[#1a1a1a] border border-white/10',
              'text-white/50'
            )}
          >
            {edgeData.label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
});

export default AnimatedEdge;
