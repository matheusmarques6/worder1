// =============================================
// Arquivos de rota só podem exportar o que o Next entende.
//
// Um `export function splitLines(...)` numa página passou pelo tsc, pelos
// 1.9 mil testes e pelo editor sem um aviso — e derrubou `next build`
// com "splitLines is not a valid Page export field". Ou seja: a falha só
// aparecia no deploy.
//
// Este teste é o build dizendo isso em dois segundos. Vale para page,
// layout, template, error, loading e route.
// =============================================
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP_DIR = join(process.cwd(), 'src', 'app')

/** Campos que o App Router aceita além do `default`. */
const ALLOWED = new Set([
  'dynamic', 'dynamicParams', 'revalidate', 'fetchCache', 'runtime', 'preferredRegion',
  'maxDuration', 'metadata', 'generateMetadata', 'generateStaticParams', 'viewport',
  'generateViewport', 'config', 'experimental_ppr',
])

/** Handlers HTTP, válidos em route.ts. */
const HTTP = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'])

const ROUTE_FILES = /^(page|layout|template|error|not-found|loading|global-error|route)\.(tsx?|jsx?)$/

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (ROUTE_FILES.test(entry)) out.push(full)
  }
  return out
}

/** Nomes exportados por `export function|const|class X` e `export { a, b }`. */
function namedExports(source: string): string[] {
  const names: string[] = []
  const decl = /^export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+([A-Za-z0-9_$]+)/gm
  for (const m of source.matchAll(decl)) names.push(m[1])
  const list = /^export\s*\{([^}]*)\}/gm
  for (const m of source.matchAll(list)) {
    for (const part of m[1].split(',')) {
      const alias = part.trim().split(/\s+as\s+/)
      const name = (alias[1] || alias[0] || '').trim()
      if (name) names.push(name)
    }
  }
  return names
}

describe('exports dos arquivos de rota', () => {
  const files = routeFiles(APP_DIR)

  it('encontra os arquivos de rota do projeto', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('nenhum arquivo de rota exporta algo que o Next não conhece', () => {
    const offenders: string[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf-8')
      const isRoute = /[\\/]route\.[tj]sx?$/.test(file)
      for (const name of namedExports(source)) {
        // `type` e `interface` somem na compilação; o Next não os vê.
        if (new RegExp(`^export\\s+(?:type|interface)\\s+${name}\\b`, 'm').test(source)) continue
        if (ALLOWED.has(name)) continue
        if (isRoute && HTTP.has(name)) continue
        offenders.push(`${file.replace(process.cwd() + '/', '')} → ${name}`)
      }
    }
    // A mensagem já diz o que fazer: mover a função para src/lib.
    expect(offenders, `Mova estes para fora do arquivo de rota (src/lib/…):\n${offenders.join('\n')}`).toEqual([])
  })
})
