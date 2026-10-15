import type { ReactNode } from 'react'
import AiShell from '@/components/ai-hub/AiShell'

// Plano IA M2 passo 16: /ai é uma casca com sub-rotas (ver AiShell).
export default function AiLayout({ children }: { children: ReactNode }) {
  return <AiShell>{children}</AiShell>
}
