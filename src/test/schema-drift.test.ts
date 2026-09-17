// =============================================
// O código não pede coluna que a tabela não tem.
//
// O PostgREST recusa a linha INTEIRA quando não conhece um campo, e o
// erro não vira exceção. Foi assim que a campanha agendada morreu, que
// nenhuma campanha de WhatsApp chegou a ser criada e que pausar campanha
// respondia "não pode pausar" para qualquer uma. Nada disso aparece no
// typecheck: do lado do Supabase, o payload é um objeto qualquer.
//
// Aqui a comparação é feita contra supabase/schema-snapshot.json — o
// retrato do esquema de produção, versionado junto do código.
//
// A dívida antiga está em supabase/schema-drift-allowlist.json, com um
// par (tabela.coluna) por linha. Ela existe porque são 131 pares
// espalhados por CRM, automações, faturas e rastreamento, e consertar
// tudo de uma vez, às cegas, seria pior do que registrar. As regras:
//
//   • par novo fora da lista REPROVA — a dívida não cresce;
//   • par da lista que sumiu do código também REPROVA, pedindo para
//     tirá-lo da lista — a dívida só encolhe.
//
// Quando o esquema mudar de verdade, atualize o retrato:
//   pnpm schema:snapshot   (documentado no README do diretório supabase)
// =============================================
import { describe, it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { extractColumnRefs } from '@/lib/db/column-refs'

const RAIZ = process.cwd()
const SNAPSHOT = join(RAIZ, 'supabase', 'schema-snapshot.json')
const ALLOWLIST = join(RAIZ, 'supabase', 'schema-drift-allowlist.json')

function arquivosDeCodigo(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry === '.next') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) arquivosDeCodigo(full, out)
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry) && !/\.d\.ts$/.test(entry)) out.push(full)
  }
  return out
}

describe('esquema do banco × colunas que o código pede', () => {
  const esquema: Record<string, string[]> = JSON.parse(readFileSync(SNAPSHOT, 'utf-8'))
  const permitidos: string[] = JSON.parse(readFileSync(ALLOWLIST, 'utf-8'))
  const arquivos = [
    ...arquivosDeCodigo(join(RAIZ, 'src')),
    ...arquivosDeCodigo(join(RAIZ, 'worker')),
  ]

  const encontrados = new Map<string, string>()   // 'tabela.coluna' -> 'arquivo:linha (tipo)'
  for (const arq of arquivos) {
    const fonte = readFileSync(arq, 'utf-8')
    for (const ref of extractColumnRefs(fonte)) {
      const colunas = esquema[ref.table]
      if (!colunas) continue                      // rpc, view fora do retrato, outro schema
      if (colunas.includes(ref.column)) continue
      const chave = `${ref.table}.${ref.column}`
      if (!encontrados.has(chave)) {
        encontrados.set(chave, `${arq.replace(RAIZ + '/', '')}:${ref.line} (${ref.kind})`)
      }
    }
  }

  it('o retrato do esquema está no lugar e é grande o bastante para ser o de verdade', () => {
    expect(Object.keys(esquema).length).toBeGreaterThan(200)
    expect(esquema['email_campaigns']).toContain('paused_at')
    expect(arquivos.length).toBeGreaterThan(300)
  })

  it('nenhuma coluna inexistente nova', () => {
    const novos = [...encontrados.entries()]
      .filter(([chave]) => !permitidos.includes(chave))
      .map(([chave, onde]) => `${chave}  ←  ${onde}`)
      .sort()
    expect(
      novos,
      'Esta coluna não existe no banco. O PostgREST vai recusar a linha inteira, ' +
      'em silêncio. Crie a coluna numa migration ou corrija o nome:\n' + novos.join('\n'),
    ).toEqual([])
  })

  it('a lista de dívida antiga não guarda par que já foi consertado', () => {
    const obsoletos = permitidos.filter((chave) => !encontrados.has(chave)).sort()
    expect(
      obsoletos,
      'Consertado! Tire estes pares de supabase/schema-drift-allowlist.json ' +
      'para a dívida não voltar sozinha:\n' + obsoletos.join('\n'),
    ).toEqual([])
  })
})
