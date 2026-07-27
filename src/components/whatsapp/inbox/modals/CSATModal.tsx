'use client'

import { useState } from 'react'
import { X, Star, Loader2 } from 'lucide-react'

interface CSATModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (rating: number, comment: string) => Promise<void>
  contactName?: string
}

export function CSATModal({ isOpen, onClose, onSubmit, contactName }: CSATModalProps) {
  const [rating, setRating] = useState(0)
  const [hoveredRating, setHoveredRating] = useState(0)
  const [comment, setComment] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!isOpen) return null

  async function handleSubmit() {
    if (rating === 0) return
    setLoading(true)
    setError(null)
    try {
      await onSubmit(rating, comment)
      onClose()
      setRating(0)
      setComment('')
    } catch (e: any) {
      setError(e?.message || 'Erro ao resolver a conversa. Tente novamente.')
    }
    setLoading(false)
  }

  async function skip() {
    onClose()
    setRating(0)
    setComment('')
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Avaliacao do atendimento</h2>
          <button onClick={skip} className="p-1 hover:bg-gray-100 rounded">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          <p className="text-sm text-gray-600 mb-4">
            {contactName ? `Como foi o atendimento de ${contactName}?` : 'Como foi o atendimento?'}
          </p>

          <div className="flex items-center justify-center gap-2 mb-4">
            {[1, 2, 3, 4, 5].map(n => (
              <button
                key={n}
                onClick={() => setRating(n)}
                onMouseEnter={() => setHoveredRating(n)}
                onMouseLeave={() => setHoveredRating(0)}
                className="p-1 transition-transform hover:scale-110"
              >
                <Star
                  className={`w-10 h-10 ${
                    n <= (hoveredRating || rating)
                      ? 'text-yellow-400 fill-yellow-400'
                      : 'text-gray-300'
                  }`}
                />
              </button>
            ))}
          </div>

          {rating > 0 && (
            <p className="text-center text-sm text-gray-500 mb-4">
              {rating === 1 && 'Muito ruim'}
              {rating === 2 && 'Ruim'}
              {rating === 3 && 'Regular'}
              {rating === 4 && 'Bom'}
              {rating === 5 && 'Excelente'}
            </p>
          )}

          <textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Comentario (opcional)"
            className="w-full px-3 py-2 border rounded-lg text-sm resize-none h-20"
          />

          {error && (
            <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 p-4 border-t">
          <button onClick={skip} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">
            Pular
          </button>
          <button
            onClick={handleSubmit}
            disabled={rating === 0 || loading}
            className="px-4 py-2 text-sm bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50 flex items-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar avaliacao
          </button>
        </div>
      </div>
    </div>
  )
}
