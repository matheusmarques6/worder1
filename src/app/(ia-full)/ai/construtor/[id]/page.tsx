'use client'

import BuilderCanvas from '@/components/ai-hub/builder/BuilderCanvas'
import { useAiOrganizationId } from '@/components/ai-hub/ai-context'

export default function AgentBuilderPage({ params }: { params: { id: string } }) {
  const organizationId = useAiOrganizationId()
  return <BuilderCanvas organizationId={organizationId} agentId={params.id} />
}
