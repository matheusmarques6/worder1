// =============================================
// Que colunas o código pede a cada tabela?
//
// O PostgREST recusa a linha INTEIRA quando não conhece um campo, e o
// erro não vira exceção — a falha passa calada. Foi assim que a campanha
// agendada morreu (error_message inexistente), que a campanha de WhatsApp
// nunca foi criada (dezesseis colunas) e que pausar campanha respondia
// "não pode pausar" para tudo (paused_at).
//
// Este módulo lê o código e diz, com bastante conservadorismo, quais
// colunas ele referencia por tabela. O teste em src/test/schema-drift
// compara isso com o retrato do esquema de produção.
//
// Conservador porque um falso positivo aqui é um teste que reprova código
// correto. Regras:
//   • só olha o que vem DEPOIS de `.from('tabela')`, no mesmo trecho;
//   • em insert/update/upsert, pega chaves de primeiro nível que sejam
//     identificadores simples;
//   • desiste da chamada inteira se houver spread, chave computada ou
//     qualquer coisa que não dê para ler com certeza;
//   • em select, ignora `*`, apelidos (`a:b`), relações embutidas
//     (`rel(...)`) e qualquer coisa com ponto;
//   • em filtro (.eq/.in/.gte/…), pega só o nome cru: caminho de json
//     (`metadata->>x`), coluna de relação embutida (`contacts.email`) e
//     qualquer coisa interpolada ficam de fora.
// =============================================

export type RefKind = 'insert' | 'update' | 'upsert' | 'select' | 'filter'

export interface ColumnRef {
  table: string
  column: string
  kind: RefKind
  /** Linha do `.from(...)` que abriu o encadeamento. */
  line: number
}

/** Opções do PostgREST que viajam junto do payload e não são colunas. */
const NAO_SAO_COLUNAS = new Set([
  'onConflict', 'ignoreDuplicates', 'count', 'head', 'returning', 'defaultToNull',
])

/** Quantos caracteres depois do `.from()` ainda contam como o mesmo encadeamento. */
const JANELA = 2500

function corpoDoObjeto(texto: string, abre: number): string | null {
  let prof = 0
  for (let k = abre; k < texto.length; k++) {
    if (texto[k] === '{') prof++
    else if (texto[k] === '}') {
      prof--
      if (prof === 0) return texto.slice(abre + 1, k)
    }
  }
  return null
}

/** Chaves de primeiro nível; `null` quando não dá para ter certeza. */
export function chavesDeNivel1(corpo: string): string[] | null {
  if (/\.\.\./.test(corpo)) return null          // spread: conjunto desconhecido
  if (/^\s*\[/.test(corpo)) return null          // array de objetos
  let nivel = 0
  let atual = ''
  const partes: string[] = []
  for (const ch of corpo) {
    if (ch === '{' || ch === '[' || ch === '(') nivel++
    else if (ch === '}' || ch === ']' || ch === ')') nivel--
    if (ch === ',' && nivel === 0) { partes.push(atual); atual = '' }
    else atual += ch
  }
  partes.push(atual)

  const saida: string[] = []
  for (const bruto of partes) {
    const p = bruto.trim()
    if (!p || p.startsWith('//')) continue
    const comDoisPontos = /^([A-Za-z_$][\w$]*)\s*:/.exec(p)
    if (comDoisPontos) { saida.push(comDoisPontos[1]); continue }
    const atalho = /^([A-Za-z_$][\w$]*)\s*$/.exec(p)
    if (atalho) { saida.push(atalho[1]); continue }
    return null   // computada, condicional, comentário estranho: desiste
  }
  return saida
}

/** Nomes simples de colunas dentro de uma string de select. */
export function colunasDoSelect(sel: string): string[] {
  let limpo = sel
  if (limpo.includes('(')) {
    // Relação embutida: as colunas de dentro são de OUTRA tabela.
    limpo = limpo.replace(/[A-Za-z_0-9]+\s*(?:!inner|!left)?\s*\([^)]*\)/g, ' ')
  }
  const saida: string[] = []
  for (const bruto of limpo.split(',')) {
    const p = bruto.trim()
    if (!p || p === '*' || p.includes(':') || p.includes('.')) continue
    if (!/^[a-z_][a-z_0-9]*$/.test(p)) continue
    saida.push(p)
  }
  return saida
}

const METODOS_DE_FILTRO = new Set([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'is',
  'in', 'contains', 'containedBy', 'overlaps',
])

/** Um nome de coluna cru; caminho de json e coluna de relação ficam de fora. */
function colunaSimples(bruto: string): string | null {
  const c = bruto.trim()
  return /^[a-z_][a-z_0-9]*$/.test(c) ? c : null
}

/**
 * O texto do encadeamento que começa logo depois do `.from(...)`: a
 * sequência de `.metodo(...)` colada nele, e nada além disso.
 */
export function trechoDaCadeia(texto: string, inicio: number): string {
  let i = inicio
  const partes: string[] = []
  for (;;) {
    while (i < texto.length && /\s/.test(texto[i])) i++
    if (texto[i] !== '.') break
    const nome = /^\.([A-Za-z_$][\w$]*)\s*\(/.exec(texto.slice(i, i + 80))
    if (!nome) break
    let j = i + nome[0].length
    let prof = 1
    let aspas: string | null = null
    while (j < texto.length && prof > 0) {
      const ch = texto[j]
      if (aspas) {
        if (ch === '\\') j++
        else if (ch === aspas) aspas = null
      } else if (ch === "'" || ch === '"' || ch === '`') aspas = ch
      else if (ch === '(') prof++
      else if (ch === ')') prof--
      j++
    }
    if (prof !== 0) break
    partes.push(texto.slice(i, j))
    i = j
  }
  return partes.join('')
}

/** Colunas citadas nos filtros de um trecho de encadeamento. */
export function colunasDeFiltro(cadeia: string): string[] {
  const saida: string[] = []
  const re = /\.([A-Za-z_$][\w$]*)\(\s*['"]([^'"]{1,120})['"]/g
  let m: RegExpExecArray | null
  while ((m = re.exec(cadeia)) !== null) {
    if (!METODOS_DE_FILTRO.has(m[1])) continue
    const coluna = colunaSimples(m[2])
    if (coluna) saida.push(coluna)
  }
  return saida
}

/** `let q = db.from('t')` → 'q'. Sem atribuição, null. */
export function variavelDaConsulta(source: string, posDoFrom: number): string | null {
  const inicioDaLinha = source.lastIndexOf('\n', posDoFrom) + 1
  const antes = source.slice(inicioDaLinha, posDoFrom)
  const m = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*[^=]*$/.exec(antes)
  return m ? m[1] : null
}

/** Filtros aplicados a uma variável de consulta no resto do arquivo. */
export function filtrosDaVariavel(source: string, variavel: string): string[] {
  const saida: string[] = []
  const re = new RegExp(
    `\\b${variavel}\\s*\\.\\s*([A-Za-z_$][\\w$]*)\\(\\s*['"]([^'"]{1,120})['"]`,
    'g',
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) {
    if (!METODOS_DE_FILTRO.has(m[1])) continue
    const coluna = colunaSimples(m[2])
    if (coluna) saida.push(coluna)
  }
  return saida
}

export function extractColumnRefs(source: string): ColumnRef[] {
  const refs: ColumnRef[] = []
  const from = /\.from\(\s*['"]([a-z_0-9]+)['"]\s*\)/g
  let m: RegExpExecArray | null
  while ((m = from.exec(source)) !== null) {
    const table = m[1]
    const depois = source.indexOf('.from(', m.index + m[0].length)
    const fim = depois > 0 && depois < m.index + m[0].length + JANELA ? depois : m.index + m[0].length + JANELA
    const trecho = source.slice(m.index + m[0].length, fim)
    const line = source.slice(0, m.index).split('\n').length

    const escritas = /\.(insert|update|upsert)\(\s*\{/g
    let w: RegExpExecArray | null
    while ((w = escritas.exec(trecho)) !== null) {
      const corpo = corpoDoObjeto(trecho, w.index + w[0].length - 1)
      if (corpo === null) continue
      const chaves = chavesDeNivel1(corpo)
      if (chaves === null) continue
      for (const c of chaves) {
        if (NAO_SAO_COLUNAS.has(c)) continue
        refs.push({ table, column: c, kind: w[1] as RefKind, line })
      }
    }

    const selects = /\.select\(\s*[`'"]([^`'"]{0,800})[`'"]/g
    let s: RegExpExecArray | null
    while ((s = selects.exec(trecho)) !== null) {
      for (const c of colunasDoSelect(s[1])) {
        refs.push({ table, column: c, kind: 'select', line })
      }
    }

    // Filtro com coluna que não existe derruba a consulta do mesmo jeito
    // que um select: foi assim que escolher uma loja zerou os cartões do
    // dashboard de automações (.eq('store_id') numa tabela sem store_id).
    //
    // Aqui a janela de 2500 caracteres não serve: entre um `.from()` e o
    // seguinte cabe a consulta de OUTRA tabela feita por uma função
    // auxiliar (`count('crm_forms').eq(…)`), e os filtros dela seriam
    // creditados à tabela errada. Só vale o que está no encadeamento —
    // a sequência literal de `.metodo(...)` colada no `.from()`.
    const cadeia = trechoDaCadeia(source, m.index + m[0].length)
    for (const coluna of colunasDeFiltro(cadeia)) {
      refs.push({ table, column: coluna, kind: 'filter', line })
    }

    // O encadeamento também pode ser montado em pedaços:
    //   let q = db.from('t').select('*')
    //   if (loja) q = q.eq('store_id', loja)
    // Quando a consulta nasce numa variável, os filtros que forem
    // aplicados a essa variável no mesmo arquivo contam para a tabela.
    const variavel = variavelDaConsulta(source, m.index)
    if (variavel) {
      for (const coluna of filtrosDaVariavel(source, variavel)) {
        refs.push({ table, column: coluna, kind: 'filter', line })
      }
    }
  }
  return refs
}
