'use client'

import AgentsList from '@/components/ai-hub/AgentsList'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

export default function AiAgentsPage() {
  const organizationId = useAiOrganizationId()
  return <AgentsList organizationId={organizationId} />
}
