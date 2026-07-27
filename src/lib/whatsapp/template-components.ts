// =============================================
// Template component builder (pure)
// src/lib/whatsapp/template-components.ts
//
// Monta o array `components` do payload de envio de template da
// Cloud API a partir de uma linha de whatsapp_templates. A tabela
// tem DOIS formatos possiveis (components JSONB da Meta e colunas
// achatadas header_type/body_text/buttons) — este modulo tolera ambos.
// Puro: importado tanto por rotas de API quanto por componentes client.
// =============================================

export type HeaderFormat = 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null

export interface TemplateShape {
  components?: any[] | null
  header_type?: string | null
  body_text?: string | null
  buttons?: any[] | null
}

export type TemplateComponentsErrorCode =
  | 'missing_header_media'
  | 'invalid_header_media'
  | 'body_vars_mismatch'
  | 'button_vars_mismatch'

export class TemplateComponentsError extends Error {
  code: TemplateComponentsErrorCode
  constructor(code: TemplateComponentsErrorCode, message: string) {
    super(message)
    this.name = 'TemplateComponentsError'
    this.code = code
  }
}

const VAR_REGEX = /\{\{\s*\d+\s*\}\}/g
const MEDIA_FORMATS = ['IMAGE', 'VIDEO', 'DOCUMENT'] as const

function findComponent(template: TemplateShape, type: string): any | undefined {
  return (template.components || []).find(
    (c: any) => String(c?.type || '').toUpperCase() === type,
  )
}

export function getHeaderFormat(template: TemplateShape): HeaderFormat {
  const header = findComponent(template, 'HEADER')
  if (header) {
    const fmt = String(header.format || 'TEXT').toUpperCase()
    if (fmt === 'TEXT' || (MEDIA_FORMATS as readonly string[]).includes(fmt)) {
      return fmt as HeaderFormat
    }
    return null
  }
  const flat = String(template.header_type || '').toUpperCase()
  if (flat === 'TEXT' || (MEDIA_FORMATS as readonly string[]).includes(flat)) {
    return flat as HeaderFormat
  }
  return null
}

export function getBodyText(template: TemplateShape): string {
  const body = findComponent(template, 'BODY')
  return body?.text ?? template.body_text ?? ''
}

export function countBodyVariables(bodyText: string | null | undefined): number {
  if (!bodyText) return 0
  const matches = bodyText.match(VAR_REGEX)
  return matches ? matches.length : 0
}

function getButtons(template: TemplateShape): any[] {
  const btnComponent = findComponent(template, 'BUTTONS')
  if (Array.isArray(btnComponent?.buttons)) return btnComponent.buttons
  return Array.isArray(template.buttons) ? template.buttons : []
}

export function getDynamicUrlButtonIndexes(template: TemplateShape): number[] {
  return getButtons(template)
    .map((b: any, i: number) => ({ b, i }))
    .filter(
      ({ b }) =>
        String(b?.type || '').toUpperCase() === 'URL' &&
        VAR_REGEX.test(String(b?.url || '')) &&
        // VAR_REGEX e global (lastIndex persiste); reseta apos o test
        ((VAR_REGEX.lastIndex = 0), true),
    )
    .map(({ i }) => i)
}

export function buildTemplateComponents(
  template: TemplateShape,
  input: { bodyVars: string[]; headerMediaUrl?: string; buttonVars?: string[] },
): any[] {
  const components: any[] = []

  const format = getHeaderFormat(template)
  if (format && format !== 'TEXT') {
    const url = (input.headerMediaUrl || '').trim()
    if (!url) {
      throw new TemplateComponentsError(
        'missing_header_media',
        `Este template exige uma midia de cabecalho (${format}). Informe a URL publica da midia (headerMediaUrl).`,
      )
    }
    if (!/^https:\/\//i.test(url)) {
      throw new TemplateComponentsError(
        'invalid_header_media',
        'headerMediaUrl deve ser uma URL https publica acessivel pela Meta.',
      )
    }
    const mediaType = format.toLowerCase() // 'image' | 'video' | 'document'
    components.push({
      type: 'header',
      parameters: [{ type: mediaType, [mediaType]: { link: url } }],
    })
  }

  const expected = countBodyVariables(getBodyText(template))
  if (expected !== input.bodyVars.length) {
    throw new TemplateComponentsError(
      'body_vars_mismatch',
      `Template espera ${expected} variavel(is) de corpo, recebeu ${input.bodyVars.length}.`,
    )
  }
  if (input.bodyVars.length > 0) {
    components.push({
      type: 'body',
      parameters: input.bodyVars.map((text) => ({ type: 'text', text })),
    })
  }

  const dynIndexes = getDynamicUrlButtonIndexes(template)
  const buttonVars = input.buttonVars || []
  if (dynIndexes.length !== buttonVars.length) {
    throw new TemplateComponentsError(
      'button_vars_mismatch',
      `Template tem ${dynIndexes.length} botao(oes) de URL dinamica, recebeu ${buttonVars.length} valor(es) (buttonVars).`,
    )
  }
  dynIndexes.forEach((btnIndex, i) => {
    components.push({
      type: 'button',
      sub_type: 'url',
      index: String(btnIndex),
      parameters: [{ type: 'text', text: buttonVars[i] }],
    })
  })

  return components
}
