'use client'

// O organization_id do usuário logado para as telas da aba IA. Vale tanto
// na casca com sidebar (Agentes, Atividade) quanto na tela cheia
// (Construtor, Conhecimento).

import { createContext, useContext } from 'react'

export const AiOrgContext = createContext<string | null>(null)

export function useAiOrganizationId(): string {
  const id = useContext(AiOrgContext)
  if (!id) throw new Error('useAiOrganizationId fora da casca /ai')
  return id
}
