'use client'

import { cn } from '@/lib/utils'

export type TemplateStatus = 'APPROVED' | 'PENDING' | 'REJECTED' | 'PAUSED' | 'DISABLED'

interface TemplateStatusBadgeProps {
  status: TemplateStatus
  size?: 'sm' | 'md'
  className?: string
}

const STATUS_CONFIG: Record<TemplateStatus, { label: string; classes: string }> = {
  APPROVED: {
    label: 'Aprovado',
    classes: 'bg-emerald-50 text-emerald-700 border border-emerald-200',
  },
  PENDING: {
    label: 'Pendente',
    classes: 'bg-amber-50 text-amber-700 border border-amber-200',
  },
  REJECTED: {
    label: 'Rejeitado',
    classes: 'bg-red-50 text-red-700 border border-red-200',
  },
  PAUSED: {
    label: 'Pausado',
    classes: 'bg-orange-50 text-orange-700 border border-orange-200',
  },
  DISABLED: {
    label: 'Desativado',
    classes: 'bg-gray-100 text-gray-500',
  },
}

const SIZE_CLASSES = {
  sm: 'px-2 py-0.5 text-xs',
  md: 'px-2.5 py-1 text-xs',
}

export function TemplateStatusBadge({
  status,
  size = 'md',
  className,
}: TemplateStatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.DISABLED

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.classes,
        SIZE_CLASSES[size],
        className
      )}
    >
      {config.label}
    </span>
  )
}

export default TemplateStatusBadge
