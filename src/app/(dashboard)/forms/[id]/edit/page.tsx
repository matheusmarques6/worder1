'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Save, Loader2, Eye, Smartphone, Monitor, Copy, Check, Settings, Palette, Zap, X, Type, Image as ImageIcon, Mail, Gift, MousePointerClick } from 'lucide-react'

interface PopupConfig {
  name: string
  type: 'popup' | 'flyout' | 'fullscreen' | 'bar'
  trigger: { type: 'time_delay' | 'scroll' | 'exit_intent' | 'click'; delay: number; scrollPercent: number }
  display: { showOnMobile: boolean; showOnDesktop: boolean; frequency: 'once' | 'session' | 'always' }
  style: { bgColor: string; borderRadius: number; maxWidth: number; padding: number; overlayColor: string; overlayOpacity: number }
  showCloseButton: boolean
  headline: { text: string; fontSize: number; color: string; fontWeight: string; align: string }
  subtitle: { text: string; fontSize: number; color: string; show: boolean }
  image: { src: string; show: boolean; position: 'top' | 'left' | 'right' }
  emailField: { show: boolean; placeholder: string; required: boolean }
  nameField: { show: boolean; placeholder: string }
  phoneField: { show: boolean; placeholder: string }
  button: { text: string; bgColor: string; textColor: string; fontSize: number; borderRadius: number; fullWidth: boolean }
  disclaimer: { text: string; show: boolean; fontSize: number; color: string }
  coupon: { code: string; show: boolean; description: string }
  successMessage: { headline: string; text: string }
}

const DEFAULT_CONFIG: PopupConfig = {
  name: 'Novo Popup',
  type: 'popup',
  trigger: { type: 'time_delay', delay: 5, scrollPercent: 50 },
  display: { showOnMobile: true, showOnDesktop: true, frequency: 'once' },
  style: { bgColor: '#FFFFFF', borderRadius: 16, maxWidth: 480, padding: 32, overlayColor: '#000000', overlayOpacity: 50 },
  showCloseButton: true,
  headline: { text: 'Ganhe 10% de desconto', fontSize: 28, color: '#111827', fontWeight: 'bold', align: 'center' },
  subtitle: { text: 'Inscreva-se e receba ofertas exclusivas', fontSize: 15, color: '#6B7280', show: true },
  image: { src: '', show: false, position: 'top' },
  emailField: { show: true, placeholder: 'Seu melhor email', required: true },
  nameField: { show: false, placeholder: 'Seu nome' },
  phoneField: { show: false, placeholder: 'WhatsApp' },
  button: { text: 'QUERO MEU DESCONTO', bgColor: '#F97316', textColor: '#FFFFFF', fontSize: 15, borderRadius: 8, fullWidth: true },
  disclaimer: { text: 'Ao se inscrever, você concorda com nossa política de privacidade.', show: true, fontSize: 11, color: '#9CA3AF' },
  coupon: { code: '', show: false, description: '' },
  successMessage: { headline: 'Pronto!', text: 'Seu cupom foi enviado para seu email.' },
}

export default function PopupBuilderPage() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string
  const [config, setConfig] = useState<PopupConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop')
  const [activeTab, setActiveTab] = useState<'content' | 'style' | 'trigger'>('content')
  const [toast, setToast] = useState('')
  const [embedCopied, setEmbedCopied] = useState(false)

  // This legacy config editor predates design_json popups. It cannot read
  // their content (form.config never exists → it always loads
  // DEFAULT_CONFIG), and its Save posts { config, status:'draft' }: the API
  // ignores `config` (silent edit loss) and applies 'draft', UNPUBLISHING a
  // live popup — all while showing a false "Salvo!". Bounce every existing
  // form to the dispatcher (/forms/[id]), which routes visual popups to the
  // real drag-and-drop editor and embeddable forms to their field editor.
  // Only the untouched 'new' scaffold below stays reachable.
  useEffect(() => {
    if (formId && formId !== 'new') router.replace(`/forms/${formId}`)
  }, [formId, router])

  useEffect(() => {
    if (formId === 'new') { setLoading(false); return }
    fetch(`/api/forms/${formId}`)
      .then(r => r.json())
      .then(data => {
        const form = data.form || data
        if (form.config) setConfig({ ...DEFAULT_CONFIG, ...form.config, name: form.name || DEFAULT_CONFIG.name })
        else if (form.name) setConfig(prev => ({ ...prev, name: form.name }))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [formId])

  const update = (path: string, value: any) => {
    setConfig(prev => {
      const keys = path.split('.')
      const newConfig = JSON.parse(JSON.stringify(prev))
      let obj = newConfig
      for (let i = 0; i < keys.length - 1; i++) obj = obj[keys[i]]
      obj[keys[keys.length - 1]] = value
      return newConfig
    })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const method = formId === 'new' ? 'POST' : 'PUT'
      const url = formId === 'new' ? '/api/forms' : `/api/forms/${formId}`
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: config.name, type: 'popup', config, status: 'draft' }),
      })
      if (res.ok) {
        setToast('Salvo!')
        setTimeout(() => setToast(''), 2000)
        if (formId === 'new') {
          const data = await res.json()
          router.replace(`/forms/${data.form?.id || data.id}/edit`)
        }
      }
    } catch {}
    setSaving(false)
  }

  const copyEmbed = () => {
    // /api/public/forms/{id}/script é o renderer vivo dos popups — o
    // antigo /api/forms/{id}/embed lê a tabela legada `forms` e não
    // renderiza popups do editor visual.
    const script = `<script src="${window.location.origin}/api/public/forms/${formId}/script" async></script>`
    navigator.clipboard?.writeText(script)
    setEmbedCopied(true)
    setTimeout(() => setEmbedCopied(false), 2000)
  }

  if (loading) return <div className="flex items-center justify-center h-screen"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  const c = config

  return (
    <div className="flex flex-col h-screen bg-gray-100 overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 h-[52px] bg-white border-b border-gray-200 flex-shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/forms')} className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><ArrowLeft size={18} /></button>
          <input value={c.name} onChange={e => update('name', e.target.value)}
            className="text-sm font-semibold text-gray-900 border-0 bg-transparent focus:outline-none focus:ring-0 w-48" />
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setDevice('desktop')} className={`p-1.5 rounded ${device === 'desktop' ? 'text-brand-600 bg-brand-50' : 'text-gray-400'}`}><Monitor size={15} /></button>
          <button onClick={() => setDevice('mobile')} className={`p-1.5 rounded ${device === 'mobile' ? 'text-brand-600 bg-brand-50' : 'text-gray-400'}`}><Smartphone size={15} /></button>
        </div>
        <div className="flex items-center gap-2">
          {formId !== 'new' && (
            <button onClick={copyEmbed} className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-gray-200 text-xs font-medium text-gray-700 rounded-lg hover:bg-gray-50">
              {embedCopied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              {embedCopied ? 'Copiado!' : 'Embed'}
            </button>
          )}
          <button onClick={handleSave} disabled={saving}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-brand-500 text-white text-xs font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Salvar
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div className="w-[280px] bg-white border-r border-gray-200 flex flex-col flex-shrink-0">
          <div className="flex border-b border-gray-200">
            {[
              { key: 'content', label: 'Conteúdo', icon: Type },
              { key: 'style', label: 'Estilo', icon: Palette },
              { key: 'trigger', label: 'Gatilho', icon: Zap },
            ].map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                className={`flex-1 py-2.5 text-[11px] font-medium flex items-center justify-center gap-1 ${activeTab === tab.key ? 'text-brand-600 border-b-2 border-brand-500 -mb-px' : 'text-gray-400'}`}>
                <tab.icon size={12} /> {tab.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 hide-scrollbar">
            {activeTab === 'content' && (
              <>
                <Section title="Título">
                  <input value={c.headline.text} onChange={e => update('headline.text', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div><label className="text-[10px] text-gray-400">Tamanho</label>
                      <input type="number" value={c.headline.fontSize} onChange={e => update('headline.fontSize', Number(e.target.value))}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>
                    <div><label className="text-[10px] text-gray-400">Cor</label>
                      <div className="flex gap-1"><input type="color" value={c.headline.color} onChange={e => update('headline.color', e.target.value)} className="w-8 h-8 rounded border p-0.5 cursor-pointer" />
                        <input value={c.headline.color} onChange={e => update('headline.color', e.target.value)} className="flex-1 px-2 py-1 border border-gray-200 rounded text-[10px] font-mono" /></div></div>
                  </div>
                </Section>
                <Section title="Subtítulo">
                  <Toggle value={c.subtitle.show} onChange={v => update('subtitle.show', v)} label="Mostrar" />
                  {c.subtitle.show && <input value={c.subtitle.text} onChange={e => update('subtitle.text', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-2" />}
                </Section>
                <Section title="Campos">
                  <Toggle value={c.emailField.show} onChange={v => update('emailField.show', v)} label="Email" />
                  <Toggle value={c.nameField.show} onChange={v => update('nameField.show', v)} label="Nome" />
                  <Toggle value={c.phoneField.show} onChange={v => update('phoneField.show', v)} label="Telefone" />
                </Section>
                <Section title="Botão">
                  <input value={c.button.text} onChange={e => update('button.text', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div><label className="text-[10px] text-gray-400">Cor Fundo</label>
                      <div className="flex gap-1"><input type="color" value={c.button.bgColor} onChange={e => update('button.bgColor', e.target.value)} className="w-8 h-8 rounded border p-0.5 cursor-pointer" />
                        <input value={c.button.bgColor} onChange={e => update('button.bgColor', e.target.value)} className="flex-1 px-1.5 py-1 border border-gray-200 rounded text-[10px] font-mono" /></div></div>
                    <div><label className="text-[10px] text-gray-400">Cor Texto</label>
                      <div className="flex gap-1"><input type="color" value={c.button.textColor} onChange={e => update('button.textColor', e.target.value)} className="w-8 h-8 rounded border p-0.5 cursor-pointer" />
                        <input value={c.button.textColor} onChange={e => update('button.textColor', e.target.value)} className="flex-1 px-1.5 py-1 border border-gray-200 rounded text-[10px] font-mono" /></div></div>
                  </div>
                </Section>
                <Section title="Cupom">
                  <Toggle value={c.coupon.show} onChange={v => update('coupon.show', v)} label="Mostrar cupom" />
                  {c.coupon.show && <>
                    <input value={c.coupon.code} onChange={e => update('coupon.code', e.target.value)} placeholder="DESCONTO10" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-2" />
                    <input value={c.coupon.description} onChange={e => update('coupon.description', e.target.value)} placeholder="10% de desconto" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-1" />
                  </>}
                </Section>
                <Section title="Disclaimer">
                  <Toggle value={c.disclaimer.show} onChange={v => update('disclaimer.show', v)} label="Mostrar" />
                  {c.disclaimer.show && <input value={c.disclaimer.text} onChange={e => update('disclaimer.text', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs mt-2" />}
                </Section>
              </>
            )}
            {activeTab === 'style' && (
              <>
                <Section title="Popup">
                  <div className="space-y-2">
                    <div><label className="text-[10px] text-gray-400">Tipo</label>
                      <select value={c.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                        <option value="popup">Popup Central</option>
                        <option value="flyout">Flyout (Lateral)</option>
                        <option value="fullscreen">Tela Cheia</option>
                        <option value="bar">Barra Superior</option>
                      </select></div>
                    <div><label className="text-[10px] text-gray-400">Cor de Fundo</label>
                      <div className="flex gap-1"><input type="color" value={c.style.bgColor} onChange={e => update('style.bgColor', e.target.value)} className="w-8 h-8 rounded border p-0.5 cursor-pointer" />
                        <input value={c.style.bgColor} onChange={e => update('style.bgColor', e.target.value)} className="flex-1 px-2 py-1 border border-gray-200 rounded text-[10px] font-mono" /></div></div>
                    <div className="grid grid-cols-2 gap-2">
                      <div><label className="text-[10px] text-gray-400">Largura Máx</label>
                        <input type="number" value={c.style.maxWidth} onChange={e => update('style.maxWidth', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>
                      <div><label className="text-[10px] text-gray-400">Raio Borda</label>
                        <input type="number" value={c.style.borderRadius} onChange={e => update('style.borderRadius', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>
                    </div>
                    <div><label className="text-[10px] text-gray-400">Padding</label>
                      <input type="number" value={c.style.padding} onChange={e => update('style.padding', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>
                  </div>
                </Section>
                <Section title="Imagem">
                  <Toggle value={c.image.show} onChange={v => update('image.show', v)} label="Mostrar imagem" />
                  {c.image.show && <>
                    <input value={c.image.src} onChange={e => update('image.src', e.target.value)} placeholder="URL da imagem" className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-2" />
                    <select value={c.image.position} onChange={e => update('image.position', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mt-1 bg-white">
                      <option value="top">Topo</option><option value="left">Esquerda</option><option value="right">Direita</option>
                    </select>
                  </>}
                </Section>
                <Section title="Botão de Fechar">
                  <Toggle value={c.showCloseButton} onChange={v => update('showCloseButton', v)} label="Mostrar X" />
                </Section>
              </>
            )}
            {activeTab === 'trigger' && (
              <>
                <Section title="Gatilho de Exibição">
                  <select value={c.trigger.type} onChange={e => update('trigger.type', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="time_delay">Tempo na página</option>
                    <option value="scroll">Rolagem da página</option>
                    <option value="exit_intent">Intenção de saída</option>
                    <option value="click">Clique em elemento</option>
                  </select>
                  {c.trigger.type === 'time_delay' && <div className="mt-2"><label className="text-[10px] text-gray-400">Segundos</label>
                    <input type="number" value={c.trigger.delay} onChange={e => update('trigger.delay', Number(e.target.value))} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>}
                  {c.trigger.type === 'scroll' && <div className="mt-2"><label className="text-[10px] text-gray-400">% da página</label>
                    <input type="number" value={c.trigger.scrollPercent} onChange={e => update('trigger.scrollPercent', Number(e.target.value))} min={0} max={100} className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs" /></div>}
                </Section>
                <Section title="Dispositivos">
                  <Toggle value={c.display.showOnDesktop} onChange={v => update('display.showOnDesktop', v)} label="Desktop" />
                  <Toggle value={c.display.showOnMobile} onChange={v => update('display.showOnMobile', v)} label="Mobile" />
                </Section>
                <Section title="Frequência">
                  <select value={c.display.frequency} onChange={e => update('display.frequency', e.target.value)} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white">
                    <option value="once">Uma vez por visitante</option>
                    <option value="session">Uma vez por sessão</option>
                    <option value="always">Sempre</option>
                  </select>
                </Section>
              </>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 flex items-center justify-center overflow-auto" style={{ backgroundColor: `rgba(0,0,0,${c.style.overlayOpacity / 100})` }}>
          <div style={{
            backgroundColor: c.style.bgColor,
            borderRadius: c.style.borderRadius,
            maxWidth: device === 'mobile' ? 340 : c.style.maxWidth,
            width: '100%',
            padding: c.style.padding,
            position: 'relative',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)',
          }}>
            {c.showCloseButton && (
              <button className="absolute top-3 right-3 w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200">
                <X size={14} />
              </button>
            )}
            {c.image.show && c.image.src && c.image.position === 'top' && (
              <img src={c.image.src} alt="" style={{ width: '100%', borderRadius: c.style.borderRadius > 4 ? c.style.borderRadius - 4 : 0, marginBottom: 16, display: 'block' }} />
            )}
            <h2 style={{ fontSize: c.headline.fontSize, color: c.headline.color, fontWeight: c.headline.fontWeight as any, textAlign: c.headline.align as any, margin: '0 0 8px', lineHeight: 1.2 }}>
              {c.headline.text}
            </h2>
            {c.subtitle.show && (
              <p style={{ fontSize: c.subtitle.fontSize, color: c.subtitle.color, textAlign: c.headline.align as any, margin: '0 0 20px', lineHeight: 1.5 }}>
                {c.subtitle.text}
              </p>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {c.nameField.show && <input placeholder={c.nameField.placeholder} style={{ width: '100%', padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, outline: 'none' }} readOnly />}
              {c.emailField.show && <input placeholder={c.emailField.placeholder} style={{ width: '100%', padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, outline: 'none' }} readOnly />}
              {c.phoneField.show && <input placeholder={c.phoneField.placeholder} style={{ width: '100%', padding: '12px 16px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 14, outline: 'none' }} readOnly />}
              <button style={{
                width: c.button.fullWidth ? '100%' : 'auto',
                padding: '14px 28px',
                backgroundColor: c.button.bgColor,
                color: c.button.textColor,
                fontSize: c.button.fontSize,
                fontWeight: 700,
                borderRadius: c.button.borderRadius,
                border: 'none',
                cursor: 'pointer',
              }}>
                {c.button.text}
              </button>
            </div>
            {c.coupon.show && c.coupon.code && (
              <div style={{ marginTop: 16, padding: '12px 16px', border: '2px dashed #F97316', borderRadius: 8, textAlign: 'center' }}>
                <p style={{ fontSize: 11, color: '#6B7280', margin: '0 0 4px' }}>{c.coupon.description || 'Seu cupom:'}</p>
                <p style={{ fontSize: 20, fontWeight: 700, color: '#F97316', letterSpacing: 2, margin: 0 }}>{c.coupon.code}</p>
              </div>
            )}
            {c.disclaimer.show && (
              <p style={{ fontSize: c.disclaimer.fontSize, color: c.disclaimer.color, textAlign: 'center', marginTop: 12, lineHeight: 1.4 }}>
                {c.disclaimer.text}
              </p>
            )}
          </div>
        </div>
      </div>

      {toast && <div className="fixed top-16 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium border border-emerald-200 shadow-lg">{toast}</div>}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
      {children}
    </div>
  )
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-1 cursor-pointer">
      <span className="text-xs text-gray-700">{label}</span>
      <div className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-brand-500' : 'bg-gray-200'}`} onClick={() => onChange(!value)}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${value ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </div>
    </label>
  )
}
