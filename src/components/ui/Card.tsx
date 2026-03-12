'use client'

import * as React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'

interface CardProps extends HTMLMotionProps<'div'> {
  variant?: 'default' | 'glass' | 'gradient'
  hoverable?: boolean
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, variant = 'default', hoverable = false, children, ...props }, ref) => {
    const variants = {
      default: 'bg-dark-900 border border-dark-700',
      glass: 'bg-dark-900/60 backdrop-blur-xl border border-dark-700/50',
      gradient: 'gradient-border bg-dark-900',
    }

    return (
      <motion.div
        ref={ref}
        className={cn(
          'rounded-2xl p-6',
          variants[variant],
          hoverable && 'transition-all duration-300 hover:border-primary-500/30 hover:shadow-glow cursor-pointer',
          className
        )}
        {...props}
      >
        {children}
      </motion.div>
    )
  }
)
Card.displayName = 'Card'
