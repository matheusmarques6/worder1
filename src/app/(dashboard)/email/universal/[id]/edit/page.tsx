'use client'

// ─────────────────────────────────────────────────────────────────────────
// Link direto para um conteúdo universal.
//
// A edição em si mora no modal, que é o mesmo que abre por cima do e-mail.
// Esta página existe só para o endereço continuar valendo — links salvos,
// abas antigas, o histórico do navegador. Fechar aqui volta para de onde
// se veio, em vez de fechar um modal que não tem nada atrás.
// ─────────────────────────────────────────────────────────────────────────

import { useParams, useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2 } from 'lucide-react'

const UniversalEditorModal = dynamic(
  () => import('@/components/email-builder/modals/UniversalEditorModal'),
  { ssr: false, loading: () => (
    <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
      <Loader2 className="w-7 h-7 text-violet-500 animate-spin" />
    </div>
  ) }
)

export default function EditUniversalPage() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  return <UniversalEditorModal savedId={id} onClose={() => router.back()} />
}
