// Um universal sozinho num documento de e-mail.
//
// O editor sabe editar um e-mail inteiro, não uma seção solta. Para
// abrir só o universal, embrulhamos ele num documento de uma seção e
// devolvemos o mesmo editor — sem um "modo universal" paralelo que
// teria de acompanhar cada recurso novo do editor.

import { createSection, type EmailDocument, type EmailSection, type EmailBlock } from '../config/types'

export type UniversalKind = 'section' | 'block'

export function universalKindOf(row: { block_json?: any; category?: string | null } | null): UniversalKind {
  if (!row) return 'block'
  if (row.block_json?._kind === 'section') return 'section'
  if (row.category === 'section') return 'section'
  return 'block'
}

const BASE_SETTINGS: EmailDocument['settings'] = {
  backgroundColor: '#f3f4f6',
  contentBackgroundColor: '#ffffff',
  contentWidth: 600,
  fontFamily: "'DM Sans', Arial, sans-serif",
  borderRadius: 0,
  preheaderText: '',
} as EmailDocument['settings']

/**
 * Documento de uma seção só, a partir da linha da biblioteca.
 *
 * Os campos de vínculo saem: dentro deste documento o universal é o
 * próprio conteúdo, não uma cópia ligada a ele. Se ficassem, o editor
 * tentaria re-sincronizar o universal consigo mesmo a cada tecla.
 */
export function universalToDoc(row: { block_json?: any; category?: string | null } | null): EmailDocument | null {
  if (!row?.block_json) return null

  if (universalKindOf(row) === 'section') {
    const sec: EmailSection = row.block_json?.section || row.block_json
    const clean: EmailSection = JSON.parse(JSON.stringify(sec))
    delete (clean as any)._savedSectionId
    delete (clean as any)._savedSectionName
    for (const col of clean.columns || []) {
      for (const b of col.blocks || []) {
        delete (b as any)._savedBlockId
        delete (b as any)._savedBlockName
      }
    }
    return { version: 2, settings: BASE_SETTINGS, sections: [clean] }
  }

  const block: EmailBlock = JSON.parse(JSON.stringify(row.block_json))
  delete (block as any)._savedBlockId
  delete (block as any)._savedBlockName
  const wrapper = createSection([100])
  wrapper.columns[0].blocks = [block]
  return { version: 2, settings: BASE_SETTINGS, sections: [wrapper] }
}

/** O caminho de volta: do documento editado para o corpo da biblioteca. */
export function docToUniversal(docOut: Record<string, any>, kind: UniversalKind): any | null {
  if (kind === 'section') {
    const outSection = docOut?.sections?.[0]
    if (!outSection) return null
    const clean = JSON.parse(JSON.stringify(outSection))
    delete clean._savedSectionId
    delete clean._savedSectionName
    for (const col of clean.columns || []) {
      for (const b of col.blocks || []) {
        delete b._savedBlockId
        delete b._savedBlockName
      }
    }
    return { _kind: 'section', section: clean }
  }
  const outBlock = docOut?.sections?.[0]?.columns?.[0]?.blocks?.[0]
  if (!outBlock) return null
  const clean = JSON.parse(JSON.stringify(outBlock))
  delete clean._savedBlockId
  delete clean._savedBlockName
  return clean
}

/**
 * Serialização com as chaves em ordem, para comparar dois pedaços do
 * documento por conteúdo. `JSON.stringify` puro depende da ordem em que
 * as chaves foram criadas, e o mesmo rodapé escrito por caminhos
 * diferentes gera ordens diferentes — a comparação diria "mudou" sempre.
 */
export function stableJson(value: any): string {
  return JSON.stringify(value, (_k, v) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.keys(v).sort().reduce((acc: any, k) => { acc[k] = v[k]; return acc }, {})
    }
    return v
  })
}

/** Avisa as outras abas que a biblioteca mudou, para elas re-hidratarem. */
export function broadcastUniversalSaved(id: string) {
  try {
    localStorage.setItem('worder:universal-saved', JSON.stringify({ id, at: Date.now() }))
  } catch { /* aba anônima / storage cheio — não é fatal */ }
}
