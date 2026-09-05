'use client'

// /settings → Perfil (primeira tela do desenho).

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { LoadingCard } from '@/components/settings/ui'

export default function SettingsIndexPage() {
  const router = useRouter()
  useEffect(() => { router.replace('/settings/account') }, [router])
  return <LoadingCard />
}
