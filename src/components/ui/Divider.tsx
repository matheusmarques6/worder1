'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface DividerProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string
}

export const Divider: React.FC<DividerProps> = ({
  className,
  label,
  ...props
}) => {
  if (label) {
    return (
      <div className={cn('flex items-center gap-4', className)} {...props}>
        <div className="flex-1 h-px bg-dark-700" />
        <span className="text-sm text-dark-500">{label}</span>
        <div className="flex-1 h-px bg-dark-700" />
      </div>
    )
  }

  return (
    <div
      className={cn('h-px bg-dark-700', className)}
      {...props}
    />
  )
}
