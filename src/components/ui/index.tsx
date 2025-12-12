'use client'

import * as React from 'react'
import { motion, HTMLMotionProps } from 'framer-motion'
import { cn } from '@/lib/utils'
import { Loader2 } from 'lucide-react'

// ===============================
// BUTTON
// ===============================
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'success'
  size?: 'sm' | 'md' | 'lg'
  isLoading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', isLoading, leftIcon, rightIcon, children, disabled, ...props }, ref) => {
    const variants = {
      primary: 'bg-gradient-to-r from-primary-600 to-primary-500 text-white hover:from-primary-500 hover:to-primary-400 shadow-lg shadow-primary-500/20',
      secondary: 'bg-dark-800 text-dark-100 border border-dark-600 hover:bg-dark-700 hover:border-dark-500',
      ghost: 'text-dark-300 hover:bg-dark-800 hover:text-dark-100',
      danger: 'bg-gradient-to-r from-error-600 to-error-500 text-white hover:from-error-500 hover:to-error-400 shadow-lg shadow-error-500/20',
      success: 'bg-gradient-to-r from-success-600 to-success-500 text-white hover:from-success-500 hover:to-success-400 shadow-lg shadow-success-500/20',
    }

    const sizes = {
      sm: 'px-3 py-1.5 text-sm',
      md: 'px-5 py-2.5 text-sm',
      lg: 'px-6 py-3 text-base',
    }

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all duration-300',
          'focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-dark-950',
          'active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100',
          variants[variant],
          variant === 'primary' && 'focus:ring-primary-500/50',
          variant === 'secondary' && 'focus:ring-dark-500/50',
          variant === 'danger' && 'focus:ring-error-500/50',
          variant === 'success' && 'focus:ring-success-500/50',
          sizes[size],
          className
        )}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          leftIcon
        )}
        {children}
        {rightIcon}
      </button>
    )
  }
)
Button.displayName = 'Button'

// ===============================
// INPUT
// ===============================
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, label, error, leftIcon, rightIcon, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-dark-300 mb-2">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-dark-500">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            className={cn(
              'w-full bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3',
              'text-dark-100 placeholder:text-dark-500',
              'focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20',
              'transition-all duration-300',
              leftIcon && 'pl-10',
              rightIcon && 'pr-10',
              error && 'border-error-500 focus:border-error-500 focus:ring-error-500/20',
              className
            )}
            {...props}
          />
          {rightIcon && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-dark-500">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p className="mt-1.5 text-sm text-error-400">{error}</p>
        )}
      </div>
    )
  }
)
Input.displayName = 'Input'

// ===============================
// TEXTAREA
// ===============================
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  error?: string
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-dark-300 mb-2">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={cn(
            'w-full bg-dark-800/50 border border-dark-600 rounded-xl px-4 py-3',
            'text-dark-100 placeholder:text-dark-500',
            'focus:outline-none focus:border-primary-500/50 focus:ring-2 focus:ring-primary-500/20',
            'transition-all duration-300 resize-none',
            error && 'border-error-500 focus:border-error-500 focus:ring-error-500/20',
            className
          )}
          {...props}
        />
        {error && (
          <p className="mt-1.5 text-sm text-error-400">{error}</p>
        )}
      </div>
    )
  }
)
Textarea.displayName = 'Textarea'

// ===============================
// CARD
// ===============================
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

// ===============================
// BADGE
// ===============================
interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'primary' | 'success' | 'warning' | 'error' | 'accent'
  size?: 'sm' | 'md'
}

export const Badge: React.FC<BadgeProps> = ({
  className,
  variant = 'default',
  size = 'md',
  children,
  ...props
}) => {
  const variants = {
    default: 'bg-dark-700 text-dark-300',
    primary: 'bg-primary-500/20 text-primary-300',
    success: 'bg-success-500/20 text-success-400',
    warning: 'bg-warning-500/20 text-warning-400',
    error: 'bg-error-500/20 text-error-400',
    accent: 'bg-accent-500/20 text-accent-400',
  }

  const sizes = {
    sm: 'px-2 py-0.5 text-xs',
    md: 'px-2.5 py-1 text-xs',
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </span>
  )
}

// ===============================
// AVATAR
// ===============================
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
    offline: 'bg-dark-500',
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
            'rounded-full object-cover bg-dark-700',
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
            'absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-dark-900',
            statusColors[status]
          )}
        />
      )}
    </div>
  )
}

// ===============================
// SKELETON
// ===============================
interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'text' | 'circular' | 'rectangular'
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className,
  variant = 'rectangular',
  ...props
}) => {
  const variants = {
    text: 'h-4 rounded',
    circular: 'rounded-full',
    rectangular: 'rounded-xl',
  }

  return (
    <div
      className={cn(
        'animate-pulse bg-dark-700',
        variants[variant],
        className
      )}
      {...props}
    />
  )
}

// ===============================
// SPINNER
// ===============================
interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg'
}

export const Spinner: React.FC<SpinnerProps> = ({
  className,
  size = 'md',
  ...props
}) => {
  const sizes = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8',
  }

  return (
    <div className={cn('flex items-center justify-center', className)} {...props}>
      <Loader2 className={cn('animate-spin text-primary-500', sizes[size])} />
    </div>
  )
}

// ===============================
// EMPTY STATE
// ===============================
interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  className,
  icon,
  title,
  description,
  action,
  ...props
}) => {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
      {...props}
    >
      {icon && (
        <div className="w-16 h-16 rounded-2xl bg-dark-800 flex items-center justify-center mb-4 text-dark-400">
          {icon}
        </div>
      )}
      <h3 className="text-lg font-semibold text-dark-100 mb-2">{title}</h3>
      {description && (
        <p className="text-dark-400 max-w-sm mb-6">{description}</p>
      )}
      {action}
    </div>
  )
}

// ===============================
// DIVIDER
// ===============================
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

// ===============================
// TOOLTIP
// ===============================
interface TooltipProps {
  content: React.ReactNode
  children: React.ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}

export const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  side = 'top',
}) => {
  const [isVisible, setIsVisible] = React.useState(false)

  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  }

  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={cn(
            'absolute z-50 px-3 py-1.5 text-sm bg-dark-700 text-dark-100 rounded-lg shadow-lg whitespace-nowrap',
            positions[side]
          )}
        >
          {content}
        </div>
      )}
    </div>
  )
}
