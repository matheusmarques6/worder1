'use client'

import KnowledgeWorkspace from '@/components/ai-hub/knowledge/KnowledgeWorkspace'
import { useAiOrganizationId } from '@/components/ai-hub/ai-context'

// Plano IA M3 passo 22: o conhecimento é da loja e ocupa a tela inteira
// (era o KnowledgeBasePanel por agente).
export default function AiKnowledgePage() {
  const organizationId = useAiOrganizationId()
  return <KnowledgeWorkspace organizationId={organizationId} />
}
