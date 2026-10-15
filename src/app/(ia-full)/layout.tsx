import type { ReactNode } from 'react'
import IaFullShell from '@/components/ai-hub/IaFullShell'

// Construtor e Conhecimento da aba IA em tela cheia (plano UI F1, passo 6).
export default function IaFullLayout({ children }: { children: ReactNode }) {
  return <IaFullShell>{children}</IaFullShell>
}
