'use client'

import { useState } from 'react'
import { X, CreditCard, Loader2 } from 'lucide-react'

interface PaymentLinkModalProps {
  isOpen: boolean
  onClose: () => void
  onSend: (data: { amount: number; description: string; paymentUrl?: string }) => Promise<void>
}

export function PaymentLinkModal({ isOpen, onClose, onSend }: PaymentLinkModalProps) {
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [paymentUrl, setPaymentUrl] = useState('')
  const [loading, setLoading] = useState(false)

  if (!isOpen) return null

  async function handleSubmit() {
    const parsed = parseFloat(amount.replace(',', '.'))
    if (!parsed || parsed <= 0) return
    setLoading(true)
    try {
      await onSend({ amount: parsed, description, paymentUrl: paymentUrl || undefined })
      onClose()
      setAmount(''); setDescription(''); setPaymentUrl('')
    } catch { /* */ }
    setLoading(false)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <CreditCard className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold">Enviar link de pagamento</h2>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Valor (BRL)</label>
            <input
              value={amount}
              onChange={e => setAmount(e.target.value.replace(/[^\d.,]/g, ''))}
              placeholder="99,90"
              inputMode="decimal"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Descricao</label>
            <input
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ex: Pedido #1234"
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">URL de pagamento (opcional)</label>
            <input
              value={paymentUrl}
              onChange={e => setPaymentUrl(e.target.value)}
              placeholder="https://checkout.seugateway.com/..."
              className="w-full px-3 py-2 border rounded-lg text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">Se vazio, um link generico sera gerado</p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Cancelar</button>
          <button
            onClick={handleSubmit}
            disabled={loading || !amount}
            className="px-4 py-2 text-sm bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar link
          </button>
        </div>
      </div>
    </div>
  )
}
