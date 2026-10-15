'use client'

import AgentEditor from '@/components/ai-hub/AgentEditor'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

export default function AgentEditorPage({ params }: { params: { id: string } }) {
  const organizationId = useAiOrganizationId()
  return <AgentEditor organizationId={organizationId} agentId={params.id} />
}
