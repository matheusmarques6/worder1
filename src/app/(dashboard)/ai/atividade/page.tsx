'use client'

import ActivityTab from '@/components/ai-hub/ActivityTab'
import { useAiOrganizationId } from '@/components/ai-hub/AiShell'

export default function AiActivityPage() {
  const organizationId = useAiOrganizationId()
  return <ActivityTab organizationId={organizationId} />
}
