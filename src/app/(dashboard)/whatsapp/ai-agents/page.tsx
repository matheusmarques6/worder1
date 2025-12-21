'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuthStore } from '@/stores'
import AIAgentList from '@/components/agents/AIAgentList'
import { Loader2 } from 'lucide-react'

export default function AIAgentsPage() {
  const router = useRouter()
  const { user, isLoading } = useAuthStore()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Wait for mount and auth check
  if (!mounted || isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-dark-900">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  // Redirect if not authenticated or no organization
  if (!user || !user.organization_id) {
    router.push('/login')
    return null
  }

  return (
    <div className="h-full bg-dark-900">
      <AIAgentList organizationId={user.organization_id} />
    </div>
  )
}
