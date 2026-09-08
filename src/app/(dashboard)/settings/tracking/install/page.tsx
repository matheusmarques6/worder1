'use client'

// Configurações → Rastreamento → Instalar em um site próprio (fora da Shopify).

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Card, Row, Title, LoadingCard, Code, CopyBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { useApi } from '@/components/settings/hooks'

export default function InstallTrackingPage() {
  const { data, loading } = useApi<{ organization: { id: string } | null }>('/api/settings/organization')
  const [base, setBase] = useState('https://app.worder.com.br')
  useEffect(() => { try { setBase(window.location.origin) } catch { /* ssr */ } }, [])
  const orgId = data?.organization?.id || 'SUA_ORGANIZACAO'

  const snippet = `<!-- Worder Pixel -->
<script>
  window.worderConfig = { organizationId: '${orgId}', apiUrl: '${base}' };
</script>
<script src="${base}/tracking.js" async></script>`
  const cdn = `<script src="${base}/tracking.js" data-org="${orgId}" async></script>`
  const identify = `worder.identify({
  email: 'cliente@exemplo.com',
  phone: '+5511999999999',
  first_name: 'João'
});`
  const product = `worder.productView({
  id: 'prod-123',
  name: 'Camiseta Premium',
  price: 99.90,
  category: 'Roupas'
});`

  return (
    <>
      <Title h="Instalar o rastreamento" p="Para lojas fora da Shopify ou sites próprios. Na Shopify, use a instalação automática em Integrações." right={<Link href="/settings/tracking" className="lnk"><I n="chevL" s={15} />Voltar para Rastreamento</Link>} />
      {loading && !data ? <LoadingCard rows={3} /> : (
        <>
          <Card title="1. Cole antes de </head>" desc="Carrega o pixel em todas as páginas e identifica visitantes que vieram dos seus e-mails.">
            <Row label="Script completo"><Code wrap>{snippet}</Code><div><CopyBtn text={snippet} small /></div></Row>
            <Row label="Versão curta" help="Mesma coisa, em uma linha."><Code wrap>{cdn}</Code><div><CopyBtn text={cdn} small /></div></Row>
          </Card>
          <Card title="2. Identifique o cliente" desc="Chame quando souber quem é o visitante (login, checkout, formulário).">
            <Row label="Exemplo"><Code wrap>{identify}</Code><div><CopyBtn text={identify} small /></div></Row>
          </Card>
          <Card title="3. Envie eventos" desc="Produto visto alimenta recomendações e o fluxo de navegação abandonada.">
            <Row label="Produto visto"><Code wrap>{product}</Code><div><CopyBtn text={product} small /></div></Row>
            <Row label="Outros eventos" help="addToCart, checkoutStarted e purchase seguem o mesmo formato."><div className="pillrow"><span className="pill2">worder.addToCart(item)</span><span className="pill2">worder.checkoutStarted(cart)</span><span className="pill2">worder.purchase(order)</span></div></Row>
          </Card>
          <Card title="Loja Shopify?" desc="Não precisa colar código.">
            <Row label="Instalação automática"><div><Link href="/integrations/shopify/install-pixel" className="btn btn-primary">Instalar pixel e extensão do tema<I n="arrowR" s={15} /></Link></div></Row>
          </Card>
        </>
      )}
    </>
  )
}
