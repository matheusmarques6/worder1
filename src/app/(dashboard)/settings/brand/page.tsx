'use client'

// Configurações → Marca (desenho PMarca v3): identidade + pré-visualização do e-mail.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/ui/Toast'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { Card, Row, Title, LoadingCard, Modal, Field } from '@/components/settings/ui'
import { I } from '@/components/settings/icons'
import { api, hostOf, timeAgo } from '@/components/settings/format'
import { useApi } from '@/components/settings/hooks'

interface Brand {
  name: string; site: string; logo_url: string | null; logo_light_url: string | null; icon_url: string | null
  colors: { primary: string; secondary: string; text: string; bg: string }
  fonts: { heading: string; body: string }
  radius: number
  footer: { address: string; instagram: string; tiktok: string; facebook: string; youtube: string }
  updated_at: string | null
}
type Slot = 'logo' | 'logo_light' | 'icon'

const FONTS: Array<[string, string]> = [['Geist', 'Moderna e neutra'], ['Georgia', 'Editorial, com serifa'], ['Arial', 'Clássica e segura']]
const ALL_FONTS = ['Geist', 'Inter', 'Arial', 'Helvetica', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Roboto', 'Open Sans', 'Montserrat', 'Poppins', 'DM Sans', 'Lato']
const RADII: Array<[number, string]> = [[0, 'Reto'], [6, 'Suave'], [12, 'Arredondado'], [999, 'Pill']]
const TPL: Record<string, { h: string; p: string; c: string }> = {
  promo: { h: 'Seu couro cabeludo pede um novo ritual', p: 'Olá Marina, o Sérum Noturno chegou. Fórmula com biotina e cafeína para fortalecer os fios enquanto você dorme.', c: 'Conhecer o Sérum' },
  cart: { h: 'Você deixou algo no carrinho', p: 'Seu Shampoo Fortalecedor ainda está reservado. Finalize agora e ganhe frete grátis.', c: 'Finalizar compra' },
  order: { h: 'Pedido #1284 confirmado', p: 'Obrigado, Marina! Estamos preparando seu pedido. Você recebe o rastreio assim que ele sair.', c: 'Acompanhar pedido' },
}
const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i
const ini = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).join('').slice(0, 2).toUpperCase() || 'W'

export default function BrandSettingsPage() {
  const { data, loading, error, reload, setData } = useApi<{ brand: Brand }>('/api/settings/brand')
  const toast = useToast()
  const confirm = useConfirm()
  const [b, setB] = useState<Brand | null>(null)
  const [edit, setEdit] = useState(false)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState<'desk' | 'mob'>('desk')
  const [tpl, setTpl] = useState<'promo' | 'cart' | 'order'>('promo')
  const [importOpen, setImportOpen] = useState(false)
  const [uploading, setUploading] = useState<Slot | null>(null)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const slotRef = useRef<Slot>('logo')

  useEffect(() => { if (data?.brand && !edit) setB(data.brand) }, [data, edit])

  const set = <K extends keyof Brand>(k: K, v: Brand[K]) => setB((o) => (o ? { ...o, [k]: v } : o))
  const setColor = (k: keyof Brand['colors'], v: string) => setB((o) => (o ? { ...o, colors: { ...o.colors, [k]: v } } : o))
  const setFooter = (k: keyof Brand['footer'], v: string) => setB((o) => (o ? { ...o, footer: { ...o.footer, [k]: v } } : o))

  const save = async () => {
    if (!b) return
    for (const k of Object.keys(b.colors) as Array<keyof Brand['colors']>) if (!HEX.test(b.colors[k])) { toast.error('Cor inválida', `Use o formato #RRGGBB em “${k}”.`); return }
    setSaving(true)
    try {
      const r = await api<{ brand: Brand }>('/api/settings/brand', { method: 'PUT', json: { brand: b } })
      setData(r); setB(r.brand); setEdit(false)
      toast.success('Marca salva', 'Novos templates já usam estas cores e fontes.')
    } catch (e: any) { toast.error('Não foi possível salvar', e.message) } finally { setSaving(false) }
  }
  const cancel = () => { setEdit(false); if (data?.brand) setB(data.brand) }

  const pickFile = (slot: Slot) => { slotRef.current = slot; fileRef.current?.click() }
  const onFile = useCallback(async (f: File) => {
    const slot = slotRef.current
    setUploading(slot)
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('slot', slot)
      const r = await api<{ brand: Brand }>('/api/settings/brand', { method: 'POST', body: fd })
      setData(r); setB((o) => (o ? { ...o, logo_url: r.brand.logo_url, logo_light_url: r.brand.logo_light_url, icon_url: r.brand.icon_url } : r.brand))
      toast.success('Imagem enviada')
    } catch (e: any) { toast.error('Não foi possível enviar', e.message) } finally { setUploading(null) }
  }, [setData, toast])
  const removeSlot = async (slot: Slot) => {
    if (!(await confirm.confirm({ title: 'Remover imagem?', confirmLabel: 'Remover', destructive: true }))) return
    try {
      const r = await api<{ brand: Brand }>('/api/settings/brand', { method: 'POST', json: { action: 'remove', slot } })
      setData(r); setB((o) => (o ? { ...o, logo_url: r.brand.logo_url, logo_light_url: r.brand.logo_light_url, icon_url: r.brand.icon_url } : r.brand))
    } catch (e: any) { toast.error('Não foi possível remover', e.message) }
  }

  const T = TPL[tpl]
  const right = edit
    ? <><button type="button" className="btn" onClick={cancel} disabled={saving}>Cancelar</button><button type="button" className="btn btn-primary" onClick={save} disabled={saving}>{saving && <I n="refresh" s={14} className="spin" />}Salvar alterações</button></>
    : <><button type="button" className="btn" onClick={() => setImportOpen(true)}><I n="ia" s={15} />Importar do site</button><button type="button" className="btn btn-primary" onClick={() => setEdit(true)}>Editar marca</button></>

  return (
    <>
      <Title h="Marca" p="Aplicada automaticamente em templates de e-mail, formulários e páginas. Mude aqui e tudo se atualiza." right={right} />
      <input ref={fileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
      {loading && !b ? <LoadingCard rows={5} /> : error && !b ? (
        <Card><div className="empty2"><b>Não foi possível carregar a marca</b>{error}<div><button className="btn" onClick={() => reload()}>Tentar de novo</button></div></div></Card>
      ) : b ? (
        <div className="brand">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="bhero">
              <div className="lg" style={{ background: b.colors.primary }}>{b.icon_url ? <img src={b.icon_url} alt="" /> : ini(b.name)}</div>
              <div>
                <div className="nm">{b.name || 'Sua marca'}</div>
                <div className="mt">{[hostOf(b.site) || null, b.fonts.heading, b.updated_at ? `atualizada ${timeAgo(b.updated_at).toLowerCase()}` : 'ainda não salva'].filter(Boolean).join(' · ')}</div>
                <div className="dots">{(['primary', 'secondary', 'text', 'bg'] as const).map((k) => <i key={k} style={{ background: b.colors[k] }} />)}</div>
              </div>
              <div className="r">{edit && <><input className="in" style={{ width: 200 }} value={b.name} onChange={(e) => set('name', e.target.value)} placeholder="Nome da marca" aria-label="Nome da marca" /><input className="in" style={{ width: 200 }} value={b.site} onChange={(e) => set('site', e.target.value)} placeholder="sualoja.com.br" aria-label="Site" /></>}</div>
            </div>

            <Card title="Logo" desc="PNG ou SVG com fundo transparente, mínimo 400px de largura.">
              <div className="lgrid" style={{ padding: '16px 0 18px' }}>
                <LogoSlot filled={!!b.logo_url} busy={uploading === 'logo'} onPick={() => pickFile('logo')} onRemove={() => removeSlot('logo')} canRemove={edit || !!b.logo_url}>
                  {b.logo_url ? <img src={b.logo_url} alt="Logo principal" /> : <b style={{ fontSize: 20, color: b.colors.primary, fontWeight: 700 }}>{b.name || 'Logo'}</b>}
                  <span>Principal · usado no cabeçalho</span>
                </LogoSlot>
                <LogoSlot dark filled={!!b.logo_light_url} busy={uploading === 'logo_light'} onPick={() => pickFile('logo_light')} onRemove={() => removeSlot('logo_light')} canRemove={!!b.logo_light_url}>
                  {b.logo_light_url ? <img src={b.logo_light_url} alt="Logo versão clara" /> : <><I n="upload" s={18} /><b style={{ color: '#E6E8EC' }}>Versão clara</b></>}
                  <span>Para fundos escuros</span>
                </LogoSlot>
                <LogoSlot filled={!!b.icon_url} busy={uploading === 'icon'} onPick={() => pickFile('icon')} onRemove={() => removeSlot('icon')} canRemove={!!b.icon_url}>
                  {b.icon_url ? <img src={b.icon_url} alt="Ícone" style={{ maxHeight: 48 }} /> : <><I n="upload" s={18} /><b>Ícone / favicon</b></>}
                  <span>Quadrado, 512×512</span>
                </LogoSlot>
              </div>
            </Card>

            <Card title="Cores" desc="Primária em botões e links; secundária em destaques; texto e fundo do corpo do e-mail.">
              <div className="pal" style={{ padding: '16px 0 18px' }}>
                {([['primary', 'Primária'], ['secondary', 'Secundária'], ['text', 'Texto'], ['bg', 'Fundo']] as Array<[keyof Brand['colors'], string]>).map(([k, l]) => (
                  <div className="c" key={k}>
                    <i style={{ background: HEX.test(b.colors[k]) ? b.colors[k] : '#fff' }}>{edit && <input type="color" aria-label={`Escolher cor ${l}`} value={HEX.test(b.colors[k]) && b.colors[k].length === 7 ? b.colors[k] : '#000000'} onChange={(e) => setColor(k, e.target.value.toUpperCase())} />}</i>
                    <div><span>{l}</span><input type="text" aria-label={`Cor ${l}`} value={b.colors[k]} onChange={(e) => setColor(k, e.target.value)} disabled={!edit} maxLength={7} /></div>
                  </div>
                ))}
              </div>
            </Card>

            <Card title="Tipografia" desc="Fontes seguras aparecem iguais em todos os leitores de e-mail.">
              <div className="fontp" style={{ padding: '16px 0 18px' }}>
                {FONTS.map(([f, d]) => (
                  <button key={f} type="button" className={b.fonts.heading === f ? 'on' : ''} onClick={() => edit && set('fonts', { heading: f, body: f })} style={{ fontFamily: f, cursor: edit ? 'pointer' : 'default' }} aria-pressed={b.fonts.heading === f}><b>Aa</b><span>{f} · {d}</span></button>
                ))}
              </div>
              {edit && !FONTS.some(([f]) => f === b.fonts.heading) && (
                <Row label="Outra fonte"><select className="in" value={b.fonts.heading} onChange={(e) => set('fonts', { heading: e.target.value, body: e.target.value })}>{ALL_FONTS.map((f) => <option key={f}>{f}</option>)}</select></Row>
              )}
            </Card>

            <Card title="Botões">
              <Row label="Cantos">
                <div className="rad">
                  {RADII.map(([r, l]) => <button key={r} type="button" className={b.radius === r ? 'on' : ''} onClick={() => edit && set('radius', r)} aria-pressed={b.radius === r} style={{ cursor: edit ? 'pointer' : 'default' }}><i style={{ borderRadius: r === 999 ? 7 : r / 2, background: b.colors.primary }} />{l}</button>)}
                </div>
              </Row>
            </Card>

            <Card title="Rodapé padrão" desc="Endereço físico e descadastro são obrigatórios por lei em todo e-mail de marketing.">
              <Row label="Endereço" htmlFor="br-addr"><input id="br-addr" className="in" value={b.footer.address} onChange={(e) => setFooter('address', e.target.value)} disabled={!edit} placeholder="Rua Exemplo, 123 — São Paulo, SP" /></Row>
              <Row label="Redes sociais">
                <div className="in2">
                  <input className="in" value={b.footer.instagram} onChange={(e) => setFooter('instagram', e.target.value)} disabled={!edit} placeholder="instagram.com/suamarca" aria-label="Instagram" />
                  <input className="in" value={b.footer.tiktok} onChange={(e) => setFooter('tiktok', e.target.value)} disabled={!edit} placeholder="tiktok.com/@suamarca" aria-label="TikTok" />
                </div>
                {(edit || b.footer.facebook || b.footer.youtube) && (
                  <div className="in2">
                    <input className="in" value={b.footer.facebook} onChange={(e) => setFooter('facebook', e.target.value)} disabled={!edit} placeholder="facebook.com/suamarca" aria-label="Facebook" />
                    <input className="in" value={b.footer.youtube} onChange={(e) => setFooter('youtube', e.target.value)} disabled={!edit} placeholder="youtube.com/@suamarca" aria-label="YouTube" />
                  </div>
                )}
              </Row>
            </Card>
          </div>

          <div className="brand-side">
            <div className="prev">
              <div className="prev-h"><span>Pré-visualização</span><div className="seg"><button type="button" className={view === 'desk' ? 'on' : ''} onClick={() => setView('desk')}>Desktop</button><button type="button" className={view === 'mob' ? 'on' : ''} onClick={() => setView('mob')}>Celular</button></div></div>
              <div className="email" style={{ ['--bf' as any]: b.fonts.heading }}>
                <div className="em" style={{ maxWidth: view === 'mob' ? 300 : '100%', margin: '0 auto', background: b.colors.bg, color: b.colors.text }}>
                  <div className="eh">{b.logo_url ? <img src={b.logo_url} alt={b.name} /> : <b style={{ color: b.colors.primary }}>{b.name || 'Sua marca'}</b>}</div>
                  <div className="img">Imagem do produto</div>
                  <div className="eb"><h4>{T.h}</h4><p>{T.p}</p><a className="cta" href="#" onClick={(e) => e.preventDefault()} style={{ background: b.colors.primary, borderRadius: b.radius === 999 ? 999 : b.radius }}>{T.c}</a></div>
                  <div className="ef">
                    <div className="soc">{[b.footer.instagram, b.footer.tiktok, b.footer.facebook, b.footer.youtube].filter(Boolean).map((s, i) => <i key={i} style={{ background: b.colors.secondary }} title={s} />)}{!b.footer.instagram && !b.footer.tiktok && !b.footer.facebook && !b.footer.youtube && <><i style={{ background: b.colors.secondary }} /><i style={{ background: b.colors.secondary }} /></>}</div>
                    {b.name}{b.footer.address ? ` · ${b.footer.address}` : ''}<br />Você recebe este e-mail porque se inscreveu em {hostOf(b.site) || `${(b.name || 'suamarca').toLowerCase().replace(/\s|\./g, '')}.com.br`} · <u>Cancelar inscrição</u>
                  </div>
                </div>
              </div>
              <div className="prev-f">{([['promo', 'Campanha'], ['cart', 'Carrinho abandonado'], ['order', 'Pedido confirmado']] as Array<[typeof tpl, string]>).map(([k, l]) => <button key={k} type="button" className={tpl === k ? 'on' : ''} onClick={() => setTpl(k)}>{l}</button>)}</div>
            </div>
          </div>
        </div>
      ) : null}

      {importOpen && b && <ImportModal site={b.site} onClose={() => setImportOpen(false)} onApply={(s) => {
        setImportOpen(false)
        setB((o) => o ? {
          ...o,
          name: s.name || o.name,
          site: s.site || o.site,
          colors: { ...o.colors, primary: s.primary || o.colors.primary, secondary: s.secondary || o.colors.secondary },
          fonts: s.heading ? { heading: s.heading, body: s.heading } : o.fonts,
          logo_url: s.logo_url || o.logo_url,
          icon_url: s.icon_url || o.icon_url,
        } : o)
        setEdit(true)
        toast.info('Sugestões aplicadas', 'Revise e clique em Salvar alterações.')
      }} />}
    </>
  )
}

function LogoSlot({ children, dark, filled, busy, onPick, onRemove, canRemove }: { children: React.ReactNode; dark?: boolean; filled: boolean; busy: boolean; onPick: () => void; onRemove: () => void; canRemove: boolean }) {
  return (
    <div className={'lslot' + (filled ? ' filled' : '') + (dark ? ' dark' : '')} role="button" tabIndex={0} onClick={onPick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick() } }} aria-busy={busy} style={{ position: 'relative', cursor: 'pointer' }}>
      {busy ? <I n="refresh" s={18} className="spin" /> : children}
      {filled && canRemove && <button type="button" className="rm" title="Remover" aria-label="Remover imagem" onClick={(e) => { e.stopPropagation(); onRemove() }}><I n="x" s={14} /></button>}
    </div>
  )
}

interface Suggestion { name: string | null; logo_url: string | null; icon_url: string | null; primary: string | null; secondary: string | null; fonts: string[]; heading: string | null; palette: string[]; site?: string }

function ImportModal({ site, onClose, onApply }: { site: string; onClose: () => void; onApply: (s: Suggestion) => void }) {
  const [url, setUrl] = useState(site || '')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [sug, setSug] = useState<Suggestion | null>(null)
  const run = async () => {
    setBusy(true); setErr(null); setSug(null)
    try { const r = await api<{ suggestion: Suggestion }>('/api/settings/brand', { method: 'POST', json: { action: 'import', url } }); setSug({ ...r.suggestion, site: url }) }
    catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }
  return (
    <Modal title="Importar do site" desc="Lemos o HTML da sua loja e sugerimos logo, ícone, cores e fonte. Nada é salvo até você confirmar." onClose={onClose}
      footer={<><button type="button" className="btn" onClick={onClose}>Cancelar</button>{sug ? <button type="button" className="btn btn-primary" onClick={() => onApply(sug)}>Usar sugestões</button> : <button type="button" className="btn btn-primary" disabled={!url || busy} onClick={run}>{busy && <I n="refresh" s={14} className="spin" />}Analisar site</button>}</>}>
      <form onSubmit={(e) => { e.preventDefault(); if (url && !busy) run() }} style={{ display: 'grid', gap: 14 }}>
        <Field label="Endereço do site" error={err}><input className={'in' + (err ? ' err' : '')} autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://sualoja.com.br" inputMode="url" /></Field>
        {sug && (
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {sug.logo_url ? <img src={sug.logo_url} alt="" style={{ maxHeight: 40, maxWidth: 160, objectFit: 'contain' }} /> : <span className="muted" style={{ fontSize: 13 }}>Logo não encontrado</span>}
              {sug.icon_url && <img src={sug.icon_url} alt="" style={{ width: 28, height: 28, borderRadius: 6 }} />}
              <b style={{ marginLeft: 'auto' }}>{sug.name || '—'}</b>
            </div>
            <div>
              <span className="inl">Cores encontradas</span>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {[sug.primary, sug.secondary, ...sug.palette].filter((c, i, a) => c && a.indexOf(c) === i).slice(0, 8).map((c) => <span key={c!} title={c!} style={{ width: 28, height: 28, borderRadius: 8, background: c!, border: '1px solid var(--line-2)' }} />)}
                {!sug.primary && <span className="muted" style={{ fontSize: 13 }}>Nenhuma cor de destaque detectada.</span>}
              </div>
            </div>
            <div><span className="inl">Fonte</span><div style={{ fontSize: 14 }}>{sug.heading || (sug.fonts[0] ? `${sug.fonts[0]} (não suportada em e-mail; mantemos a atual)` : 'Não detectada')}</div></div>
          </div>
        )}
      </form>
    </Modal>
  )
}
