'use client'

// =============================================================
// BodyPortal — renderiza o filho direto no <body>.
//
// Um modal `position: fixed` só cobre a tela se nenhum ancestral tiver
// `transform`, `filter` ou `will-change`. O painel lateral do fluxo
// anima com translateX (framer-motion) e vários campos ficam dentro de
// wrappers com `-translate-y-1/2`; o modal aberto ali dentro vira um
// filho "fixed" desse wrapper de 40px e aparece como uma coluna
// esmagada em cima do campo. Renderizar no body devolve o viewport
// como referência, sem mexer em nenhum layout.
//
// Contexto React (AnimatePresence, zustand, temas) atravessa o portal.
// =============================================================

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export function BodyPortal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  useEffect(() => {
    setTarget(document.body)
  }, [])
  if (!target) return null
  return createPortal(children, target)
}
