'use client';

import { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import ShopifyConnect from '@/components/integrations/shopify/ShopifyConnect';

export default function ShopifyIntegrationPage() {
  const router = useRouter();

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-6">
        <button
          onClick={() => router.push('/integrations')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar para Integrações
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <Suspense fallback={<div className="py-20 text-center text-gray-400">Carregando...</div>}>
          <ShopifyConnect />
        </Suspense>
      </div>
    </div>
  );
}
