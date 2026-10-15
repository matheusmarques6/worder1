'use client'

import KnowledgeBasePanel from '@/components/agents/KnowledgeBasePanel'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

export default function AiKnowledgePage() {
  const organizationId = useAiOrganizationId()
  return <KnowledgeBasePanel organizationId={organizationId} />
}
