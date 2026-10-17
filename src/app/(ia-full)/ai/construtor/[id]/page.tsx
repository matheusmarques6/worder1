'use client';
import { use } from "react";

import BuilderCanvas from '@/components/ai-hub/builder/BuilderCanvas'
import { useAiOrganizationId } from '@/components/ai-hub/ai-context'

export default function AgentBuilderPage(props: { params: Promise<{ id: string }> }) {
  const params = use(props.params);
  const organizationId = useAiOrganizationId()
  return <BuilderCanvas organizationId={organizationId} agentId={params.id} />
}
