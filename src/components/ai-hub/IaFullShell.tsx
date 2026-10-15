'use client'

// Tela cheia da aba IA (protótipo: iframe .ia-full do app completo): o
// Construtor e o Conhecimento cobrem o app inteiro, sem a sidebar e o topo
// do Worder, com a barra escura própria e o botão Fechar.

import type { ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { ToastProvider } from '@/components/ui/Toast'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import { AiOrgContext } from './ai-context'
import { useIaBootstrap } from './useIaBootstrap'
import { IaProto } from './proto/ui'

export default function IaFullShell({ children }: { children: ReactNode }) {
  const { ready, organizationId } = useIaBootstrap()
  return (
    <ToastProvider>
      <ConfirmProvider>
        <IaProto full style={{ position: 'fixed', inset: 0, height: '100dvh' }}>
          {ready && organizationId ? (
            <AiOrgContext.Provider value={organizationId}>{children}</AiOrgContext.Provider>
          ) : (
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Loader2 size={22} className="animate-spin" />
            </div>
          )}
        </IaProto>
      </ConfirmProvider>
    </ToastProvider>
  )
}
