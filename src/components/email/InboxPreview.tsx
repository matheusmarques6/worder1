'use client'

import { Star, MoreVertical } from 'lucide-react'

interface InboxPreviewProps {
  senderName?: string
  subject?: string
  preheader?: string
}

export default function InboxPreview({
  senderName,
  subject,
  preheader,
}: InboxPreviewProps) {
  return (
    <div className="bg-gray-50 rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">
        Pré-visualização da caixa de entrada
      </p>

      <div className="space-y-2">
        {/* Skeleton rows above */}
        {Array.from({ length: 2 }).map((_, i) => (
          <div
            key={`top-${i}`}
            className="flex items-center gap-3 px-2 py-2"
          >
            <Star className="w-3.5 h-3.5 text-gray-300" />
            <div className="w-3 h-3 rounded-sm border border-gray-300" />
            <div className="flex-1 grid grid-cols-12 gap-2">
              <div className="col-span-3 h-2 bg-gray-200 rounded" />
              <div className="col-span-5 h-2 bg-gray-200 rounded" />
              <div className="col-span-4 h-2 bg-gray-200 rounded" />
            </div>
          </div>
        ))}

        {/* Active row (the campaign preview) */}
        <div className="flex items-center gap-3 px-2 py-2 bg-white rounded-md border border-gray-200 shadow-sm">
          <Star className="w-3.5 h-3.5 text-gray-300" />
          <div className="w-3 h-3 rounded-sm border border-gray-300" />
          <div className="flex-1 min-w-0 grid grid-cols-12 gap-3 items-center">
            <p className="col-span-3 text-xs font-semibold text-gray-900 truncate">
              {senderName || 'Sua Loja'}
            </p>
            <div className="col-span-7 flex items-center gap-1.5 min-w-0">
              <p className="text-xs font-medium text-gray-900 truncate">
                {subject || 'Assunto do email'}
              </p>
              {preheader && (
                <>
                  <span className="text-gray-300 text-xs">—</span>
                  <p className="text-xs text-gray-500 truncate">{preheader}</p>
                </>
              )}
            </div>
            <p className="col-span-2 text-right text-[10px] text-gray-400">agora</p>
          </div>
        </div>

        {/* Skeleton rows below */}
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={`bot-${i}`}
            className="flex items-center gap-3 px-2 py-2"
          >
            <Star className="w-3.5 h-3.5 text-gray-300" />
            <div className="w-3 h-3 rounded-sm border border-gray-300" />
            <div className="flex-1 grid grid-cols-12 gap-2">
              <div className="col-span-3 h-2 bg-gray-200 rounded" />
              <div className="col-span-6 h-2 bg-gray-200 rounded" />
              <div className="col-span-3 h-2 bg-gray-200 rounded" />
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200">
        <p className="text-[11px] text-gray-500 leading-relaxed">
          É assim que sua campanha aparecerá na caixa de entrada dos destinatários.
          <br />
          <span className="text-gray-400">
            Dica: mantenha o assunto com menos de 50 caracteres para mobile.
          </span>
        </p>
      </div>
    </div>
  )
}
