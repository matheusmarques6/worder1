'use client'

// =============================================
// Primitivos de UI alinhados ao design Worder.
// Usados em todas as telas do módulo /ai pra garantir consistência:
//  - Cores: charcoal (#18181B), zinc-200 (#E4E4E7), muted (#A1A1AA)
//  - Cantos: rounded-[14px] (main), rounded-[12px] (secondary), rounded-[10px] (modals)
//  - Tipografia: text-[26px]/font-bold pra H1, tabular-nums pros números
//  - Botão primário: #18181B (charcoal), CTA orange só pra ações de criação
// =============================================

import { Loader2 } from 'lucide-react'
import * as React from 'react'

// ---------- Page ----------

interface PageProps {
  title: string
  description?: string
  actions?: React.ReactNode
  children: React.ReactNode
  /** Renderiza dentro do shell padrão do dashboard. Acrescenta o spacing certo. */
  containerClassName?: string
}

export function Page({ title, description, actions, children, containerClassName }: PageProps) {
  return (
    <div className={`px-8 py-10 lg:px-12 lg:py-12 pb-16 max-w-[1400px] mx-auto ${containerClassName ?? ''}`}>
      <PageHeader title={title} description={description} actions={actions} />
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
      <div>
        <h1
          className="text-[26px] font-bold text-[#18181B] leading-tight"
          style={{ letterSpacing: '-0.03em' }}
        >
          {title}
        </h1>
        {description && <p className="text-[14px] text-[#A1A1AA] mt-1">{description}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </header>
  )
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
      <div>
        <h2
          className="text-[16px] font-semibold text-[#18181B]"
          style={{ letterSpacing: '-0.01em' }}
        >
          {title}
        </h2>
        {description && <p className="text-[13px] text-[#A1A1AA] mt-0.5">{description}</p>}
      </div>
      {actions}
    </div>
  )
}

// ---------- Card ----------

export function Card({
  children,
  className,
  size = 'md',
  hover = false,
}: {
  children: React.ReactNode
  className?: string
  size?: 'sm' | 'md'
  hover?: boolean
}) {
  const sizing =
    size === 'sm'
      ? 'rounded-[12px] px-5 py-[18px]'
      : 'rounded-[14px] px-7 py-6'
  return (
    <div
      className={`bg-white border border-[#E4E4E7] ${sizing} ${
        hover ? 'transition-colors hover:bg-[#FAFAFA]' : ''
      } ${className ?? ''}`}
    >
      {children}
    </div>
  )
}

// ---------- Button ----------

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'cta' | 'danger'
type ButtonSize = 'sm' | 'md'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

const VARIANT_CLS: Record<ButtonVariant, string> = {
  // Primary: charcoal — usado pra ações neutras/confirmação
  primary: 'bg-[#18181B] text-white hover:bg-[#27272A]',
  // Secondary: outlined — fechar, voltar, cancelar
  secondary:
    'bg-white text-[#52525B] border border-[#E4E4E7] hover:border-[#D4D4D8] hover:bg-[#FAFAFA]',
  // Ghost: minimal — links/ações inline
  ghost: 'text-[#52525B] hover:text-[#18181B] hover:bg-[#F4F4F5]',
  // CTA: orange — apenas pra criação primária ("Novo agente")
  cta: 'bg-[#F97316] text-white hover:bg-[#EA580C]',
  // Danger: red — ações destrutivas
  danger: 'bg-white text-red-600 border border-red-200 hover:bg-red-50',
}

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-[12px] font-semibold rounded-[8px]',
  md: 'px-4 py-2 text-[13px] font-semibold rounded-[8px]',
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, leadingIcon, trailingIcon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`inline-flex items-center justify-center gap-1.5 transition-colors
                  disabled:opacity-50 disabled:cursor-not-allowed
                  ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className ?? ''}`}
      {...rest}
    >
      {loading ? (
        <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.75} />
      ) : (
        leadingIcon
      )}
      {children}
      {!loading && trailingIcon}
    </button>
  )
})

// ---------- Empty State ----------

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action?: React.ReactNode
}) {
  return (
    <Card>
      <div className="py-10 text-center">
        <p className="text-[14px] font-semibold text-[#18181B]">{title}</p>
        {description && (
          <p className="text-[13px] text-[#A1A1AA] mt-1 max-w-md mx-auto">{description}</p>
        )}
        {action && <div className="mt-4 inline-flex">{action}</div>}
      </div>
    </Card>
  )
}

// ---------- Modal ----------

interface ModalProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
  footer?: React.ReactNode
}

export function Modal({ open, onClose, title, description, size = 'md', children, footer }: ModalProps) {
  React.useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  const widthCls = size === 'sm' ? 'max-w-md' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(24, 24, 27, 0.4)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`bg-white border border-[#E4E4E7] w-full ${widthCls} max-h-[90vh] flex flex-col`}
        style={{ borderRadius: 14, boxShadow: '0 12px 48px rgba(0,0,0,0.12)' }}
      >
        <div className="px-6 pt-5 pb-4 border-b border-[#F4F4F5]">
          <h3
            className="text-[16px] font-semibold text-[#18181B]"
            style={{ letterSpacing: '-0.01em' }}
          >
            {title}
          </h3>
          {description && <p className="text-[13px] text-[#A1A1AA] mt-1">{description}</p>}
        </div>
        <div className="px-6 py-5 overflow-auto flex-1">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-[#F4F4F5] flex justify-end gap-2">
            {footer}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------- Field (label + input wrapper) ----------

export function Field({
  label,
  hint,
  error,
  children,
  required,
}: {
  label: string
  hint?: string
  error?: string
  children: React.ReactNode
  required?: boolean
}) {
  return (
    <div className="mb-4">
      <label className="text-[12px] font-semibold text-[#52525B] mb-1.5 inline-block">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-[12px] text-[#A1A1AA] mt-1.5">{hint}</p>}
      {error && <p className="text-[12px] text-red-600 mt-1.5">{error}</p>}
    </div>
  )
}

const INPUT_BASE =
  'w-full px-3 py-2 text-[13px] bg-white border border-[#E4E4E7] rounded-[8px] ' +
  'text-[#18181B] placeholder:text-[#A1A1AA] ' +
  'focus:outline-none focus:border-[#18181B] focus:ring-2 focus:ring-[#18181B]/10 ' +
  'transition-colors'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...rest }, ref) {
    return <input ref={ref} className={`${INPUT_BASE} ${className ?? ''}`} {...rest} />
  },
)

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={`${INPUT_BASE} resize-none ${className ?? ''}`} {...rest} />
})

export const Select = React.forwardRef<
  HTMLSelectElement,
  React.SelectHTMLAttributes<HTMLSelectElement>
>(function Select({ className, children, ...rest }, ref) {
  return (
    <select ref={ref} className={`${INPUT_BASE} ${className ?? ''}`} {...rest}>
      {children}
    </select>
  )
})

// ---------- Badge ----------

type BadgeTone = 'neutral' | 'subtle' | 'orange' | 'success' | 'warning' | 'danger'

const BADGE_TONE: Record<BadgeTone, string> = {
  neutral: 'bg-[#F4F4F5] text-[#52525B] border-[#E4E4E7]',
  subtle: 'bg-white text-[#71717A] border-[#E4E4E7]',
  orange: 'bg-[#FFF7ED] text-[#C2410C] border-[#FED7AA]',
  success: 'bg-[#F0FDF4] text-[#166534] border-[#BBF7D0]',
  warning: 'bg-[#FFFBEB] text-[#92400E] border-[#FDE68A]',
  danger: 'bg-[#FEF2F2] text-[#991B1B] border-[#FECACA]',
}

export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode
  tone?: BadgeTone
  className?: string
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-semibold
                  rounded-full border ${BADGE_TONE[tone]} ${className ?? ''}`}
    >
      {children}
    </span>
  )
}

// ---------- Toggle ----------

export function Toggle({
  enabled,
  onClick,
  size = 'md',
  ariaLabel,
}: {
  enabled: boolean
  onClick: () => void
  size?: 'sm' | 'md'
  ariaLabel?: string
}) {
  const dim = size === 'sm' ? { w: 'w-8', h: 'h-4', dot: 'h-3 w-3', tx: 'translate-x-4' } : { w: 'w-9', h: 'h-5', dot: 'h-3.5 w-3.5', tx: 'translate-x-5' }
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={enabled}
      aria-label={ariaLabel}
      className={`relative inline-flex ${dim.h} ${dim.w} items-center rounded-full transition-colors ${
        enabled ? 'bg-[#18181B]' : 'bg-[#E4E4E7]'
      }`}
    >
      <span
        className={`inline-block ${dim.dot} transform rounded-full bg-white shadow-sm transition-transform ${
          enabled ? dim.tx : 'translate-x-1'
        }`}
      />
    </button>
  )
}

// ---------- Spinner inline ----------

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={`animate-spin text-[#A1A1AA] ${className ?? 'w-5 h-5'}`} strokeWidth={1.75} />
}

// ---------- Stat number ----------

/** Número grande com tabular-nums (alinhamento perfeito de dígitos) */
export function Num({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>
      {children}
    </span>
  )
}
