'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function ContactsRedirect() {
  const router = useRouter()

  useEffect(() => {
    router.replace('/crm/contacts')
  }, [router])

  return null
}
