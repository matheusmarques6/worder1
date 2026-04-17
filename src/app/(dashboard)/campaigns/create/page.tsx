'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'

export default function CreateCampaignRedirect() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/email/campaigns/new')
  }, [router])

  return (
    <div className="flex items-center justify-center py-32">
      <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
    </div>
  )
}
