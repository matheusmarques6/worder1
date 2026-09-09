// =============================================
// Nenhuma rota costura o texto do lojista dentro de um filtro.
//
// O PostgREST recebe filtros como texto na query string. Quando o termo
// de busca entra ali por interpolação, vírgula e parêntese deixam de ser
// letras e passam a ser gramática — o cliente reescreve a consulta do
// servidor. Dezesseis rotas faziam isso.
//
// O saneamento mora em @/lib/db/search-term; este teste é o guarda que
// impede a interpolação crua de voltar, em rota nova ou antiga.
// =============================================
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const API_DIR = join(process.cwd(), 'src', 'app', 'api')

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (/^route\.[tj]sx?$/.test(entry)) out.push(full)
  }
  return out
}

/** `${search}` (ou `${q}`, `${term}`…) dentro de um filtro. */
const CRU = /\.(or|ilike|like|filter)\(\s*[`'"][^`'"]*\$\{\s*(search|searchTerm|q|term|query|busca)\b[^}]*\}/

describe('termo de busca nos filtros', () => {
  const files = routeFiles(API_DIR)

  it('encontra as rotas da API', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('nenhuma rota interpola o termo cru num filtro', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      for (const linha of source.split('\n')) {
        if (CRU.test(linha)) offenders.push(`${file.replace(process.cwd() + '/', '')}: ${linha.trim().slice(0, 110)}`)
      }
    }
    expect(
      offenders,
      `Use sanitizeSearchTerm() de @/lib/db/search-term antes de interpolar:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
