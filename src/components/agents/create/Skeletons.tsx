'use client';

import { motion } from 'framer-motion';

export function AgentCardSkeleton() {
  return (
    <div className="bg-gray-50/50 border border-gray-200/50 rounded-xl p-4 animate-pulse">
      <div className="flex items-start gap-4">
        {/* Avatar skeleton */}
        <div className="w-12 h-12 rounded-xl bg-gray-100/50" />
        
        {/* Content skeleton */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <div className="h-5 w-32 bg-gray-100/50 rounded" />
            <div className="h-4 w-16 bg-gray-100/50 rounded-full" />
          </div>
          <div className="h-4 w-48 bg-gray-100/50 rounded" />
          <div className="flex gap-4">
            <div className="h-3 w-24 bg-gray-100/50 rounded" />
            <div className="h-3 w-20 bg-gray-100/50 rounded" />
            <div className="h-3 w-24 bg-gray-100/50 rounded" />
          </div>
        </div>
        
        {/* Actions skeleton */}
        <div className="flex gap-2">
          <div className="w-8 h-8 bg-gray-100/50 rounded-lg" />
          <div className="w-8 h-8 bg-gray-100/50 rounded-lg" />
        </div>
      </div>
    </div>
  );
}

export function AgentListSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.1 }}
        >
          <AgentCardSkeleton />
        </motion.div>
      ))}
    </div>
  );
}

export function StatCardSkeleton() {
  return (
    <div className="bg-gray-50/50 rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-2 mb-2">
        <div className="w-4 h-4 bg-gray-100/50 rounded" />
        <div className="w-20 h-3 bg-gray-100/50 rounded" />
      </div>
      <div className="w-16 h-8 bg-gray-100/50 rounded" />
    </div>
  );
}

export function StatsGridSkeleton() {
  return (
    <div className="grid grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <StatCardSkeleton key={i} />
      ))}
    </div>
  );
}

export function TemplateGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: i * 0.05 }}
          className="p-4 rounded-xl border border-gray-200 bg-gray-50/50 animate-pulse"
        >
          <div className="w-12 h-12 rounded-lg bg-gray-100/50 mb-3" />
          <div className="w-24 h-5 bg-gray-100/50 rounded mb-2" />
          <div className="w-full h-4 bg-gray-100/50 rounded" />
        </motion.div>
      ))}
    </div>
  );
}

export default AgentCardSkeleton;
