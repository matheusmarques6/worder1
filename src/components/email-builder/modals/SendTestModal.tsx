'use client'

import { useState } from 'react'
import { X, Send, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface SendTestModalProps {
  isOpen: boolean
  onClose: () => void
  html: string
  defaultSubject: string
  /** Loja cujo remetente (nome, e-mail, reply-to) o teste deve usar. */
  storeId?: string | null
}

export function SendTestModal({ isOpen, onClose, html, defaultSubject, storeId }: SendTestModalProps) {
  const [email, setEmail] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<'success' | 'error' | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const [sentFrom, setSentFrom] = useState('')

  if (!isOpen) return null

  const isValidEmail = email.includes('@') && email.includes('.')

  const handleSend = async () => {
    if (!isValidEmail) return
    setSending(true)
    setResult(null)
    try {
      const res = await fetch('/api/email/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html, testEmail: email, subject, storeId: storeId || undefined }),
      })
      const data = await res.json()
      if (res.ok) {
        setResult('success')
        setSentFrom(data.from || '')
        setTimeout(() => { onClose(); setResult(null); setEmail(''); setSentFrom('') }, 2600)
      } else {
        setResult('error')
        setErrorMsg(data.error || 'Falha ao enviar')
      }
    } catch (err: any) {
      setResult('error')
      setErrorMsg(err.message || 'Erro de conexão')
    }
    setSending(false)
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white rounded-xl shadow-2xl w-[440px] max-w-full">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Enviar Email de Teste</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded"><X className="w-4 h-4" /></button>
        </div>

        {/* Form */}
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Para</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="seu@email.com" autoFocus
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Assunto</label>
            <input type="text" value={subject} onChange={e => setSubject(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-500 focus:ring-1 focus:ring-brand-500/20 outline-none" />
          </div>

          {/* Mini preview */}
          <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
            <iframe srcDoc={html} title="Preview" className="w-full pointer-events-none" style={{ height: 160, transform: 'scale(0.5)', transformOrigin: 'top left', width: '200%' }} />
          </div>

          <p className="text-[11px] text-gray-400 flex items-center gap-1">
            <AlertCircle className="w-3 h-3" /> O email será enviado com dados de exemplo para as merge tags.
          </p>

          {/* Result */}
          {result === 'success' && (
            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span className="text-sm text-emerald-700 font-medium">
                Teste enviado para {email}
                {sentFrom && <span className="block text-xs font-normal text-emerald-600 mt-0.5">Remetente: {sentFrom}</span>}
              </span>
            </div>
          )}
          {result === 'error' && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <span className="text-sm text-red-700">{errorMsg}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-gray-100">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors">
            Cancelar
          </button>
          <button onClick={handleSend} disabled={sending || !isValidEmail}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand-500 text-white text-sm font-semibold rounded-lg hover:bg-brand-600 disabled:opacity-50 transition-colors">
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Enviando...' : 'Enviar Teste'}
          </button>
        </div>
      </div>
    </div>
  )
}
