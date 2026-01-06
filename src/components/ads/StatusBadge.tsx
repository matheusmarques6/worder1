/**
 * StatusBadge - Badge de status com toggle
 */

'use client';

import { useState } from 'react';
import { getStatusLabel, getStatusColor, type AdStatus } from '@/utils/ads-formatting';
import { Loader2, Play, Pause } from 'lucide-react';

interface StatusBadgeProps {
  status: AdStatus;
  showToggle?: boolean;
  onToggle?: (newStatus: 'ACTIVE' | 'PAUSED') => Promise<void>;
  size?: 'sm' | 'md';
}

export function StatusBadge({ 
  status, 
  showToggle = false, 
  onToggle,
  size = 'md'
}: StatusBadgeProps) {
  const [isToggling, setIsToggling] = useState(false);
  const colors = getStatusColor(status);
  const label = getStatusLabel(status);
  
  const canToggle = showToggle && onToggle && (status === 'ACTIVE' || status === 'PAUSED');
  const newStatus = status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE';
  
  const handleToggle = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!onToggle || isToggling) return;
    
    setIsToggling(true);
    try {
      await onToggle(newStatus);
    } finally {
      setIsToggling(false);
    }
  };

  const sizeClasses = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-sm',
  };

  return (
    <div className="flex items-center gap-2">
      <span className={`
        inline-flex items-center gap-1.5 rounded-full font-medium
        ${colors.bg} ${colors.text} ${sizeClasses[size]}
      `}>
        <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`} />
        {label}
      </span>
      
      {canToggle && (
        <button
          onClick={handleToggle}
          disabled={isToggling}
          className={`
            p-1 rounded-md transition-colors
            ${status === 'ACTIVE' 
              ? 'hover:bg-yellow-100 text-yellow-600' 
              : 'hover:bg-green-100 text-green-600'
            }
            disabled:opacity-50 disabled:cursor-not-allowed
          `}
          title={status === 'ACTIVE' ? 'Pausar' : 'Ativar'}
        >
          {isToggling ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : status === 'ACTIVE' ? (
            <Pause className="w-4 h-4" />
          ) : (
            <Play className="w-4 h-4" />
          )}
        </button>
      )}
    </div>
  );
}

export default StatusBadge;
