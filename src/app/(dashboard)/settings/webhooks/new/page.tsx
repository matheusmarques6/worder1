'use client'

import Link from 'next/link'
import { Title } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import WebhookEditor from '@/components/settings/WebhookEditor'

export default function NewWebhookPage() {
  return (
    <>
      <Title h="Novo endpoint" p="Receba eventos da loja em tempo real no seu sistema." right={<Link href="/settings/webhooks" className="lnk"><I n="chevL" s={15} />Voltar para Webhooks</Link>} />
      <WebhookEditor />
    </>
  )
}
