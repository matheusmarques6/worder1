'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function KlaviyoIntegrationPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirecionar para a página de settings com a tab de integrações
    // O modal de Klaviyo será aberto automaticamente
    router.replace('/settings?tab=integrations&config=klaviyo');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary-500"></div>
    </div>
  );
}
