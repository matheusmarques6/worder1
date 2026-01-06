'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { FacebookAdsManager } from '@/components/ads'
import { useStore } from '@/hooks/useStore'
import { Loader2, Store, AlertCircle } from 'lucide-react'

// Facebook Icon
const FacebookIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 text-blue-600">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
  </svg>
)

export default function FacebookAdsPage() {
  const { currentStore, stores, loading: storeLoading, selectStore } = useStore()
  const searchParams = useSearchParams()
  
  // Se vier store_id na URL
  useEffect(() => {
    const storeIdFromUrl = searchParams.get('store_id')
    if (storeIdFromUrl && stores.length > 0) {
      const store = stores.find(s => s.id === storeIdFromUrl)
      if (store && currentStore?.id !== storeIdFromUrl) {
        selectStore(store.id)
      }
    }
  }, [searchParams, stores, currentStore, selectStore])

  // Loading
  if (storeLoading) {
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
          <div className="p-3 rounded-xl bg-blue-100">
            <FacebookIcon />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Facebook Ads</h1>
            <p className="text-gray-500 mt-1">Performance de campanhas Meta</p>
          </div>
        </div>

        {/* Aviso */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 flex items-start gap-4">
          <AlertCircle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-medium text-yellow-800">Selecione uma loja</h3>
            <p className="text-yellow-700 mt-1">
              Para visualizar os dados do Meta Ads, você precisa primeiro selecionar uma loja.
            </p>
          </div>
        </div>

        {/* Seletor de lojas */}
        {stores.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-medium text-gray-900 mb-4">Suas lojas</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {stores.map((store) => (
                <button
                  key={store.id}
                  onClick={() => selectStore(store.id)}
                  className="flex items-center gap-3 p-4 border border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors text-left"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Store className="w-5 h-5 text-gray-500" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{store.name}</p>
                    <p className="text-sm text-gray-500">{store.domain}</p>
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
