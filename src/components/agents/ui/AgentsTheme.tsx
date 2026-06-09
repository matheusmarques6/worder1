'use client'

import { HTMLAttributes, ReactNode } from 'react'
import '@/styles/agents-theme.css'

/**
 * Wraps a subtree in the scoped "Agentes de IA" design system (`.agents-theme`).
 * All redesigned tokens/components live under this class so they never affect
 * the rest of the app. Importing the stylesheet here guarantees it ships
 * wherever the theme is used.
 */
export function AgentsTheme({
  children,
  className = '',
  ...rest
}: { children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`agents-theme ${className}`} {...rest}>
      {children}
    </div>
  )
}

export default AgentsTheme
