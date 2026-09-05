'use client'

// Configurações → Rastreamento (desenho PRastre): fontes de dados da loja e
// eventos recebidos nas últimas 24 h.

import Link from 'next/link'
import { useStoreStore } from '@/stores'
import { Card, Title, LoadingCard, Badge, IconBtn } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { nf, timeAgo } from '@/components/settings/format'
import { useApi } from '@/components/settings/hooks'

interface Resp {
  store: { id: string; domain: string; name: string; last_sync_at: string | null } | null
  sources: { shopify: { ok: boolean; count30: number; webhooks: boolean }; pixel: { ok: boolean; count30: number }; theme: { ok: boolean; count30: number } }
  total24: number
  events: Array<{ id: string; type: string; label: string; summary: string; source: string; at: string }>
}

export default function TrackingSettingsPage() {
  const { currentStore, _hasHydrated } = useStoreStore() as any
  const storeId: string | null = currentStore?.id || null
  const storeName: string = currentStore?.name || currentStore?.shop_name || 'sua loja'
  const { data, loading, error, reload } = useApi<Resp>(_hasHydrated ? `/api/settings/tracking${storeId ? `?storeId=${encodeURIComponent(storeId)}` : ''}` : null, [storeId])

  if (!_hasHydrated || (loading && !data)) return <><Title h="Rastreamento" p={`O que ${storeName} está enviando para o Worder e o que falta instalar.`} /><LoadingCard rows={3} /><LoadingCard rows={3} /></>
  if (error || !data) return <><Title h="Rastreamento" /><Card><div className="empty2"><b>Não foi possível carregar</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card></>

  const s = data.sources
  const rows: Array<{ t: string; h: string; ok: boolean; st: string; count: number; install: string }> = [
    { t: 'Loja Shopify', h: 'Pedidos, clientes e catálogo via API', ok: s.shopify.ok, st: s.shopify.ok ? (s.shopify.webhooks ? 'Conectada' : 'Conectada · sem webhooks') : 'Não conectada', count: s.shopify.count30, install: '/integrations/shopify' },
    { t: 'Web Pixel', h: 'Checkout iniciado, carrinho e compra no navegador', ok: s.pixel.ok, st: s.pixel.ok ? 'Instalado' : 'Não instalado', count: s.pixel.count30, install: data.store ? '/integrations/shopify/install-pixel' : '/settings/tracking/install' },
    { t: 'Extensão do tema', h: 'Produto visto, busca e navegação', ok: s.theme.ok, st: s.theme.ok ? 'Ativa' : 'Inativa', count: s.theme.count30, install: data.store ? '/integrations/shopify/install-pixel' : '/settings/tracking/install' },
  ]

  return (
    <>
      <Title h="Rastreamento" p={`O que ${data.store?.name || storeName} está enviando para o Worder e o que falta instalar.`} right={<Link href="/settings/tracking/install" className="lnk">Instalar em um site próprio<I n="chevR" s={15} /></Link>} />
      <Card flush>
        {rows.map((r) => (
          <div key={r.t} className="chk" style={{ padding: '16px 24px' }}>
            <span className={'ic ' + (r.ok ? 'ok' : 'no')}><I n={r.ok ? 'check' : 'x'} s={13} /></span>
            <div><div>{r.t}</div><div className="hp">{r.h}{r.ok && r.count ? ` · ${nf(r.count)} eventos em 30 dias` : ''}</div></div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, alignItems: 'center' }}>
              {r.ok ? <Badge k="ok">{r.st}</Badge> : <><Badge k="off">{r.st}</Badge><Link href={r.install} className="btn btn-sm btn-primary">Instalar</Link></>}
            </div>
          </div>
        ))}
      </Card>

      <Card title="Eventos recebidos" desc={`Últimas 24 horas${data.total24 ? ` · ${nf(data.total24)} no total` : ''}.`} right={<IconBtn n="refresh" s={15} title="Atualizar" onClick={() => reload(true)} className={loading ? 'spin' : ''} />} flush>
        {data.events.length === 0 ? (
          <div className="empty2"><b>Nenhum evento nas últimas 24 horas</b>{s.shopify.ok || s.pixel.ok ? 'Assim que a loja tiver movimento, os eventos aparecem aqui.' : 'Conecte a loja ou instale o pixel para começar a receber eventos.'}</div>
        ) : (
          <div className="tw"><table className="stbl"><tbody>
            {data.events.map((e) => (
              <tr key={e.id}><td className="fx"><span className="nm">{e.label}</span><span className="mt">{e.summary}</span></td><td className="r" style={{ color: 'var(--text-3)' }}>{timeAgo(e.at)}</td></tr>
            ))}
          </tbody></table></div>
        )}
      </Card>
    </>
  )
}
