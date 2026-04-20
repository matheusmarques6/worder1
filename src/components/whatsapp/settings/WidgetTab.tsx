'use client'

import { useState, useEffect } from 'react'
import { Globe, Copy, Check, Loader2, MessageCircle } from 'lucide-react'

interface WidgetConfig {
  id?: string
  phone_number: string
  welcome_message: string
  position: 'left' | 'right'
  color: string
  delay_seconds: number
  is_active: boolean
}

export function WidgetTab({ organizationId, storeId }: { organizationId: string; storeId?: string }) {
  const [config, setConfig] = useState<WidgetConfig>({
    phone_number: '', welcome_message: 'Ola! Como posso ajudar?',
    position: 'right', color: '#25D366', delay_seconds: 3, is_active: true,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => { load() }, [organizationId, storeId])

  async function load() {
    setLoading(true)
    try {
      const url = `/api/whatsapp/widget?organizationId=${organizationId}${storeId ? `&storeId=${storeId}` : ''}`
      const res = await fetch(url)
      if (res.ok) {
        const { data } = await res.json()
        if (data) setConfig(data)
      }
    } catch { /* */ }
    setLoading(false)
  }

  async function save() {
    if (!config.phone_number) return
    setSaving(true)
    try {
      await fetch(`/api/whatsapp/widget?organizationId=${organizationId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, storeId }),
      })
    } catch { /* */ }
    setSaving(false)
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://seudominio.com'
  const widgetCode = `<!-- Worder WhatsApp Widget -->
<script>
(function(){
  var phone="${config.phone_number}";
  var msg=encodeURIComponent("${config.welcome_message}");
  var pos="${config.position}";
  var color="${config.color}";
  var delay=${config.delay_seconds}*1000;
  setTimeout(function(){
    var b=document.createElement("a");
    b.href="https://wa.me/"+phone.replace(/\\D/g,"")+"?text="+msg;
    b.target="_blank";
    b.style.cssText="position:fixed;bottom:20px;"+pos+":20px;z-index:9999;background:"+color+";color:white;width:60px;height:60px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 12px rgba(0,0,0,.15);transition:transform .2s";
    b.onmouseover=function(){b.style.transform="scale(1.1)"};
    b.onmouseout=function(){b.style.transform="scale(1)"};
    b.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/></svg>';
    document.body.appendChild(b);
  },delay);
})();
</script>`

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold">Widget WhatsApp para site</h3>

      <div className="grid grid-cols-2 gap-6">
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Telefone WhatsApp (com DDI)</label>
            <input value={config.phone_number} onChange={e => setConfig({ ...config, phone_number: e.target.value })} placeholder="5511999999999" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Mensagem de boas-vindas</label>
            <textarea value={config.welcome_message} onChange={e => setConfig({ ...config, welcome_message: e.target.value })} className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-20" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Posicao</label>
              <select value={config.position} onChange={e => setConfig({ ...config, position: e.target.value as 'left' | 'right' })} className="w-full px-3 py-2 border rounded-lg text-sm">
                <option value="right">Direita</option>
                <option value="left">Esquerda</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cor</label>
              <input type="color" value={config.color} onChange={e => setConfig({ ...config, color: e.target.value })} className="w-full h-10 rounded cursor-pointer" />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Delay para aparecer (segundos)</label>
            <input type="number" value={config.delay_seconds} onChange={e => setConfig({ ...config, delay_seconds: parseInt(e.target.value) || 0 })} min="0" className="w-full px-3 py-2 border rounded-lg text-sm" />
          </div>
          <button onClick={save} disabled={saving || !config.phone_number} className="w-full px-4 py-2 bg-primary-500 text-white rounded-lg text-sm hover:bg-primary-600 disabled:opacity-50 flex items-center justify-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} Salvar configuracao
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Preview</label>
            <div className="relative bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl h-48 overflow-hidden">
              <div className="absolute text-xs text-gray-400 top-4 left-4">Seu site</div>
              <div
                className="absolute bottom-4 w-14 h-14 rounded-full flex items-center justify-center shadow-lg cursor-pointer"
                style={{ backgroundColor: config.color, [config.position]: '16px' } as React.CSSProperties}
              >
                <MessageCircle className="w-7 h-7 text-white" />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Codigo para colar no seu site</label>
            <div className="relative">
              <pre className="bg-gray-900 text-green-400 text-xs p-3 rounded-lg overflow-x-auto max-h-64">{widgetCode}</pre>
              <button
                onClick={() => { navigator.clipboard.writeText(widgetCode); setCopied(true); setTimeout(() => setCopied(false), 2000) }}
                className="absolute top-2 right-2 px-2 py-1 bg-white/10 text-white rounded text-xs hover:bg-white/20 flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copiado!' : 'Copiar'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
