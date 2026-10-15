'use client'

import ActivityDashboard from '@/components/ai-hub/ActivityDashboard'

// Plano IA M5 passo 29: o painel de negócio dos agentes, sobre os desfechos
// por conversa. Os relatórios e a avaliação antigos (ReportsView, EvalView)
// saem da aba — a avaliação vive no checklist de ativação (passo 26).
export default function AiActivityPage() {
  return <ActivityDashboard />
}
