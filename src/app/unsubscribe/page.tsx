'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { CheckCircle, Loader2 } from 'lucide-react'

function UnsubscribeContent() {
  const searchParams = useSearchParams()
  const contactId = searchParams.get('r')
  const orgId = searchParams.get('o')
  const [status, setStatus] = useState<'loading' | 'done' | 'error'>('loading')

  useEffect(() => {
    if (!contactId || !orgId) {
      setStatus('error')
      return
    }

    fetch('/api/email/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contactId, orgId }),
    })
      .then(res => {
        if (res.ok) setStatus('done')
        else setStatus('error')
      })
      .catch(() => setStatus('error'))
  }, [contactId, orgId])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg border border-gray-200 p-10 max-w-md w-full text-center">
        {status === 'loading' && (
          <>
            <Loader2 className="w-10 h-10 text-gray-400 animate-spin mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900">Processando...</h1>
            <p className="text-sm text-gray-500 mt-2">Removendo sua inscri\u00e7\u00e3o.</p>
          </>
        )}
        {status === 'done' && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h1 className="text-xl font-semibold text-gray-900">Inscri\u00e7\u00e3o removida</h1>
            <p className="text-sm text-gray-500 mt-2">
              Voc\u00ea n\u00e3o receber\u00e1 mais emails de marketing. Esta altera\u00e7\u00e3o pode levar at\u00e9 24 horas para ser efetivada.
            </p>
            <p className="text-xs text-gray-400 mt-6">
              Se voc\u00ea removeu sua inscri\u00e7\u00e3o por engano, entre em contato com o suporte.
            </p>
          </>
        )}
        {status === 'error' && (
          <>
            <h1 className="text-xl font-semibold text-gray-900">Erro</h1>
            <p className="text-sm text-gray-500 mt-2">
              N\u00e3o foi poss\u00edvel processar sua solicita\u00e7\u00e3o. Tente novamente mais tarde.
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export default function UnsubscribePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-gray-400" /></div>}>
      <UnsubscribeContent />
    </Suspense>
  )
}
