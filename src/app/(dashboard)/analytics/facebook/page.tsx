'use client'

import { Suspense } from 'react'
import { useStoreStore } from '@/stores'
import { Loader2, Store as StoreIcon, AlertCircle, Facebook } from 'lucide-react'
import dynamic from 'next/dynamic'

// Import dinâmico do FacebookAdsManager para evitar erros de SSR
const FacebookAdsManager = dynamic(
  () => import('@/components/ads/FacebookAdsManager').then(mod => mod.FacebookAdsManager),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }
)

function FacebookAdsContent() {
  const { currentStore, stores, isLoading, setCurrentStore } = useStoreStore()

  // Loading
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  // Sem loja selecionada
  if (!currentStore) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/20">
            <Facebook className="w-6 h-6 text-blue-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Facebook Ads</h1>
            <p className="text-dark-400 mt-1">Performance de campanhas Meta</p>
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-400">Selecione uma loja</h3>
            <p className="text-yellow-500/80 mt-1">
              Para visualizar os dados do Meta Ads, você precisa primeiro selecionar uma loja.
            </p>
          </div>
        </div>

        {/* Seletor de lojas */}
        {stores.length > 0 && (
          <div className="bg-dark-800/50 rounded-xl border border-dark-700/50 p-6">
            <h3 className="font-medium text-white mb-4">Suas lojas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => setCurrentStore(store)}
                  className="flex items-center gap-3 p-4 border border-dark-700/50 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-dark-700/50 rounded-lg flex items-center justify-center">
                    <StoreIcon className="w-5 h-5 text-dark-400" />
                  </div>
                  <div>
                    <p className="font-medium text-white">{store.name}</p>
                    <p className="text-sm text-dark-400">{store.domain}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <FacebookAdsManager 
        storeId={currentStore.id} 
        storeName={currentStore.name}
      />
    </div>
  )
}

export default function FacebookAdsPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    }>
      <FacebookAdsContent />
    </Suspense>
  )
}
