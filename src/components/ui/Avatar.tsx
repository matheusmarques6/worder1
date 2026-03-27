'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  src?: string
  alt?: string
  fallback?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  status?: 'online' | 'offline' | 'busy' | 'away'
}

export const Avatar: React.FC<AvatarProps> = ({
  className,
  src,
  alt,
  fallback,
  size = 'md',
  status,
  ...props
}) => {
  const sizes = {
    sm: 'w-8 h-8 text-xs',
    md: 'w-10 h-10 text-sm',
    lg: 'w-12 h-12 text-base',
    xl: 'w-16 h-16 text-lg',
  }

  const statusColors = {
    online: 'bg-success-500',
    offline: 'bg-gray-300',
    busy: 'bg-error-500',
    away: 'bg-warning-500',
  }

  return (
    <div className={cn('relative inline-flex', className)} {...props}>
      {src ? (
        <img
          src={src}
          alt={alt}
          className={cn(
            'rounded-full object-cover bg-gray-100',
            sizes[size]
          )}
        />
      ) : (
        <div
          className={cn(
            'rounded-full bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center font-medium text-white',
            sizes[size]
          )}
        >
          {fallback}
        </div>
      )}
      {status && (
        <span
          className={cn(
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-gray-200',
            statusColors[status]
          )}
        />
      )}
    </div>
  )
}
