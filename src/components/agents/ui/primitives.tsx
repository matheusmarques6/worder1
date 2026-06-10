'use client'

import { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

/**
 * Reusable primitives for the "Agentes de IA" redesign. They emit the scoped
 * class names defined in `src/styles/agents-theme.css`, so they MUST render
 * inside an <AgentsTheme> wrapper. Kept separate from the global `ui/*`
 * primitives to avoid regressing the rest of the app.
 */

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

/* ---------------- Button ---------------- */
type ButtonVariant = 'primary' | 'ghost' | 'soft' | 'dark'
type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  soft: 'btn-soft',
  dark: 'btn-dark',
}
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
}

export function Button({
  variant = 'ghost',
  size = 'md',
  block = false,
  className,
  children,
  ...rest
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  block?: boolean
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cx('btn', BTN_VARIANT[variant], BTN_SIZE[size], block && 'btn-block', className)}
      {...rest}
    >
      {children}
    </button>
  )
}

/* ---------------- Card ---------------- */
export function Card({
  className,
  children,
  ...rest
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cx('card', className)} {...rest}>
      {children}
    </div>
  )
}

/* ---------------- Chip ---------------- */
type ChipTone = 'default' | 'brand' | 'green' | 'blue' | 'outline'
const CHIP_TONE: Record<ChipTone, string> = {
  default: '',
  brand: 'chip-brand',
  green: 'chip-green',
  blue: 'chip-blue',
  outline: 'chip-outline',
}

export function Chip({
  tone = 'default',
  className,
  children,
  ...rest
}: { tone?: ChipTone } & HTMLAttributes<HTMLSpanElement>) {
  return (
    <span className={cx('chip', CHIP_TONE[tone], className)} {...rest}>
      {children}
    </span>
  )
}

/* ---------------- SelectableCard ---------------- */
export function SelectableCard({
  selected = false,
  accent,
  showCheck = true,
  checkIcon,
  className,
  children,
  ...rest
}: {
  selected?: boolean
  accent?: 'blue'
  showCheck?: boolean
  checkIcon?: ReactNode
} & HTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cx('selcard', selected && 'on', accent === 'blue' && 'blue', className)}
      {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
    >
      {showCheck && <span className="check">{checkIcon}</span>}
      {children}
    </button>
  )
}

/* ---------------- Toggle ---------------- */
export function Toggle({
  checked = false,
  onChange,
  className,
  ...rest
}: {
  checked?: boolean
  onChange?: (next: boolean) => void
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'>) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange?.(!checked)}
      className={cx('tog', checked && 'on', className)}
      {...rest}
    />
  )
}

/* ---------------- SegmentedControl ---------------- */
export interface SegmentOption<T extends string = string> {
  value: T
  label: ReactNode
  icon?: ReactNode
}

export function SegmentedControl<T extends string = string>({
  options,
  value,
  onChange,
  className,
}: {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div className={cx('seg-ctl', className)}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={cx(opt.value === value && 'on')}
          onClick={() => onChange(opt.value)}
        >
          {opt.icon}
          {opt.label}
        </button>
      ))}
    </div>
  )
}

/* ---------------- Stepper ---------------- */
export interface StepItem {
  label: ReactNode
  /** sublabel shown only in the vertical variant */
  sublabel?: ReactNode
}

/**
 * Horizontal pill stepper (wizard top) or vertical stepper (wizard side).
 * `current` is the active index; steps before it render as "done".
 */
export function Stepper({
  steps,
  current,
  orientation = 'horizontal',
  onStepClick,
  doneIcon,
  className,
}: {
  steps: StepItem[]
  current: number
  orientation?: 'horizontal' | 'vertical'
  onStepClick?: (index: number) => void
  doneIcon?: ReactNode
  className?: string
}) {
  if (orientation === 'vertical') {
    return (
      <div className={cx('steps-v', className)}>
        {steps.map((step, i) => {
          const state = i < current ? 'done' : i === current ? 'on' : ''
          return (
            <button
              key={i}
              type="button"
              className={cx('vstep', state)}
              onClick={onStepClick ? () => onStepClick(i) : undefined}
            >
              <span className="vnum">{i < current && doneIcon ? doneIcon : i + 1}</span>
              <span>
                <span className="vt">{step.label}</span>
                {step.sublabel && <span className="vs">{step.sublabel}</span>}
              </span>
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className={cx('steps-h', className)}>
      {steps.map((step, i) => {
        const state = i < current ? 'done' : i === current ? 'on' : ''
        return (
          <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            {i > 0 && <span className="step-sep" />}
            <button
              type="button"
              className={cx('step-pill', state)}
              onClick={onStepClick ? () => onStepClick(i) : undefined}
            >
              <span className="num">{i < current && doneIcon ? doneIcon : i + 1}</span>
              {step.label}
            </button>
          </span>
        )
      })}
    </div>
  )
}

/* ---------------- Accordion ---------------- */
/**
 * Collapsible section using the scoped `.accordion`/`.acc-*` classes. Used by
 * the editor's Persona/Configurações/Permissões tabs. The header content
 * (`title`) is fully caller-controlled; this only wires the open/close affordance.
 */
export function AccordionItem({
  open,
  onToggle,
  title,
  className,
  children,
}: {
  open: boolean
  onToggle: () => void
  title: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <div className={cx('accordion', className)}>
      <button type="button" className={cx('acc-head', open && 'open')} onClick={onToggle}>
        {title}
        <ChevronDown className="ch" />
      </button>
      {open && <div className="acc-body">{children}</div>}
    </div>
  )
}
