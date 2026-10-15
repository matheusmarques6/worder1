// CSV de perguntas e respostas (plano IA M3 passo 19). Parser pequeno e puro
// (RFC 4180: aspas, aspas duplas escapadas, quebras dentro de aspas), com
// vírgula ou ponto e vírgula como separador — o que as planilhas em PT-BR
// exportam.

export interface QaRow { question: string; answer: string }

export function parseCsv(text: string, delimiter?: ',' | ';'): string[][] {
  const src = text.replace(/^﻿/, '')
  const sep = delimiter ?? detectDelimiter(src)
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') { quoted = true; continue }
    if (ch === sep) { row.push(field); field = ''; continue }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); field = ''
      if (row.some((f) => f.trim())) rows.push(row)
      row = []
      continue
    }
    field += ch
  }
  row.push(field)
  if (row.some((f) => f.trim())) rows.push(row)
  return rows
}

export function detectDelimiter(text: string): ',' | ';' {
  const head = text.split(/\r?\n/, 1)[0] ?? ''
  return (head.match(/;/g)?.length ?? 0) > (head.match(/,/g)?.length ?? 0) ? ';' : ','
}

const QUESTION_HEADERS = ['pergunta', 'question', 'q', 'duvida', 'dúvida']
const ANSWER_HEADERS = ['resposta', 'answer', 'a', 'r']

/** Linhas de P&R: usa o cabeçalho quando existe, senão as duas primeiras colunas. */
export function qaRowsFromCsv(text: string): QaRow[] {
  const rows = parseCsv(text)
  if (rows.length === 0) return []
  const header = rows[0].map((h) => h.trim().toLowerCase())
  let qi = header.findIndex((h) => QUESTION_HEADERS.includes(h))
  let ai = header.findIndex((h) => ANSWER_HEADERS.includes(h))
  let body = rows
  if (qi >= 0 && ai >= 0) body = rows.slice(1)
  else { qi = 0; ai = 1 }
  return body
    .map((r) => ({ question: (r[qi] ?? '').trim(), answer: (r[ai] ?? '').trim() }))
    .filter((r) => r.question && r.answer)
}

/** Uma FAQ inteira como nota: cada pergunta vira seção com a resposta pronta. */
export function faqMarkdown(rows: QaRow[]): string {
  return rows
    .map((r) => `## ${r.question}\n\n> [!resposta]\n> ${r.answer.replace(/\r?\n/g, '\n> ')}`)
    .join('\n\n')
}

/** Uma nota por pergunta. */
export function noteMarkdown(row: QaRow): string {
  return `# ${row.question}\n\n> [!resposta]\n> ${row.answer.replace(/\r?\n/g, '\n> ')}`
}
