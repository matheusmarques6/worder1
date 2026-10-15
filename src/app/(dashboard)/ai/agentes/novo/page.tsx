'use client'

import NewAgentWizard from '@/components/ai-hub/NewAgentWizard'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

export default function NewAgentPage() {
  const organizationId = useAiOrganizationId()
  return <NewAgentWizard organizationId={organizationId} />
}
