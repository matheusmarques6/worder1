#!/usr/bin/env node
// =============================================
// Atualiza supabase/schema-snapshot.json a partir do banco.
//
// Usa a mesma consulta que gerou o retrato: colunas de cada tabela e view
// do schema public. Precisa de SUPABASE_DB_URL (string de conexão) — o
// mesmo valor que o Supabase mostra em Project Settings → Database.
//
//   SUPABASE_DB_URL=postgres://… pnpm schema:snapshot
// =============================================
import { writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const url = process.env.SUPABASE_DB_URL
if (!url) {
  console.error('Falta SUPABASE_DB_URL (Project Settings → Database → Connection string).')
  process.exit(1)
}

const CONSULTA = `
select json_object_agg(table_name, cols)::text
from (
  select c.table_name, json_agg(c.column_name order by c.column_name) as cols
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema and t.table_name = c.table_name
  where c.table_schema = 'public' and t.table_type in ('BASE TABLE','VIEW')
  group by c.table_name
) s;`

let saida
try {
  saida = execFileSync('psql', [url, '-At', '-c', CONSULTA], { encoding: 'utf-8' })
} catch (e) {
  console.error('Falhou ao consultar o banco. `psql` está instalado e a URL está certa?')
  console.error(e.message)
  process.exit(1)
}

const dados = JSON.parse(saida.trim())
const retrato = Object.fromEntries(
  Object.entries(dados).sort(([a], [b]) => a.localeCompare(b)).map(([t, cols]) => [t, [...cols].sort()]),
)
const destino = join(RAIZ, 'supabase', 'schema-snapshot.json')
writeFileSync(destino, JSON.stringify(retrato, null, 0) + '\n')
console.log(`retrato atualizado: ${Object.keys(retrato).length} tabelas em ${destino}`)
console.log('Rode os testes: se a migration resolveu dívida antiga, o teste diz o que tirar da lista.')
