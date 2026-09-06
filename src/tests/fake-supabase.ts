// =============================================================
// Supabase de mentira para testes de isolamento entre lojas.
//
// Guarda tabelas em memória e entende o subconjunto do PostgREST que o
// código usa: select / eq / neq / in / or / gte / order / limit /
// single / maybeSingle, e `await` no builder. O `.or()` aceita as
// formas que aparecem nas consultas de loja:
//   col.eq.valor · col.is.null · col.ilike.valor · col.cs.{valor}
// Cada cláusula é OU; a linha entra se qualquer uma casar.
// =============================================================

export type Row = Record<string, any>

export interface FakeSupabase {
  from: (table: string) => any
  /** Chama uma função registrada com `defineRpc`; sem registro, devolve erro. */
  rpc: (name: string, args?: Row) => Promise<{ data: any; error: any }>
  /** Registra o retorno de uma função do banco para os testes. */
  defineRpc: (name: string, fn: (args: Row) => any) => void
  tables: Record<string, Row[]>
  /** Chamadas registradas: [tabela, método, argumentos]. */
  calls: Array<[string, string, any[]]>
  seed: (table: string, rows: Row[]) => void
  /** Declara uma chave única: insert repetido devolve erro 23505. */
  unique: (table: string, cols: string[]) => void
  reset: () => void
}

function orClause(expr: string): (r: Row) => boolean {
  const clauses = expr.split(',').map((c) => c.trim()).filter(Boolean)
  const preds = clauses.map((c) => {
    const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|is|ilike|cs|neq)\.(.*)$/)
    if (!m) return () => false
    const [, col, op, raw] = m
    return (r: Row) => {
      const v = r[col]
      switch (op) {
        case 'eq': return String(v) === raw
        case 'neq': return String(v) !== raw
        case 'is': return raw === 'null' ? v == null : String(v) === raw
        case 'ilike': return String(v ?? '').toLowerCase() === raw.replace(/%/g, '').toLowerCase()
        case 'cs': {
          const inner = raw.replace(/^\{|\}$/g, '')
          return Array.isArray(v) && v.map(String).includes(inner)
        }
        default: return false
      }
    }
  })
  return (r) => preds.some((p) => p(r))
}

export function createFakeSupabase(): FakeSupabase {
  const tables: Record<string, Row[]> = {}
  const uniques: Record<string, string[][]> = {}
  const calls: Array<[string, string, any[]]> = []
  const rpcs: Record<string, (args: Row) => any> = {}

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let limitN: number | null = null
    let rangeFrom: number | null = null
    let rangeTo: number | null = null
    let single = false
    let head = false
    let orderCol: string | null = null
    let orderAsc = true
    // Escrita pendente: aplicada quando o builder é aguardado.
    let op: 'select' | 'insert' | 'update' | 'delete' = 'select'
    let payload: any = null
    const b: any = {}
    const chain = (name: string, fn?: (...a: any[]) => void) => {
      b[name] = (...args: any[]) => { calls.push([table, name, args]); fn?.(...args); return b }
    }
    chain('select', (_cols: string, opts?: any) => { if (opts?.head) head = true })
    chain('eq', (col: string, val: any) => filters.push((r) => String(r[col]) === String(val)))
    chain('neq', (col: string, val: any) => filters.push((r) => String(r[col]) !== String(val)))
    chain('in', (col: string, vals: any[]) => filters.push((r) => (vals || []).map(String).includes(String(r[col]))))
    chain('gte', (col: string, val: any) => filters.push((r) => r[col] != null && r[col] >= val))
    chain('lte', (col: string, val: any) => filters.push((r) => r[col] != null && r[col] <= val))
    chain('ilike', (col: string, val: string) => filters.push((r) => String(r[col] ?? '').toLowerCase() === String(val).replace(/%/g, '').toLowerCase()))
    chain('or', (expr: string) => filters.push(orClause(expr)))
    // .not(col, op, valor) — o `in` recebe a lista já no formato PostgREST,
    // ("a","b"), que é como o código monta a exclusão de produtos do feed.
    chain('not', (col: string, op: string, val: any) => filters.push((r) => {
      const v = r[col]
      switch (op) {
        case 'in': {
          const list = String(val).replace(/^\(|\)$/g, '').split(',')
            .map((s) => s.trim().replace(/^"|"$/g, ''))
          return !list.includes(String(v))
        }
        case 'is': return String(val) === 'null' ? v != null : String(v) !== String(val)
        case 'eq': return String(v) !== String(val)
        default: return true
      }
    }))
    chain('order', (col: string, opts?: { ascending?: boolean }) => { orderCol = col; orderAsc = opts?.ascending !== false })
    chain('limit', (n: number) => { limitN = n })
    chain('range', (from: number, to: number) => { rangeFrom = from; rangeTo = to })
    chain('single', () => { single = true })
    chain('maybeSingle', () => { single = true })
    chain('update', (patch: any) => { op = 'update'; payload = patch })
    chain('insert', (rows: any) => { op = 'insert'; payload = rows })
    chain('upsert', (rows: any) => { op = 'insert'; payload = rows })
    chain('delete', () => { op = 'delete' })

    const violates = (row: Row): boolean => {
      const keys = uniques[table] || []
      const existing = tables[table] || []
      return keys.some((cols) => existing.some((e) => cols.every((c) => String(e[c]) === String(row[c]))))
    }

    b.then = (resolve: any, reject: any) => {
      let result: any
      if (op === 'insert') {
        const rows: Row[] = (Array.isArray(payload) ? payload : [payload]).map((r: any) => ({ ...r }))
        const dup = rows.find(violates)
        if (dup) {
          result = { data: null, error: { code: '23505', message: `duplicate key value violates unique constraint (${table})` } }
        } else {
          tables[table] = [...(tables[table] || []), ...rows]
          result = { data: single ? rows[0] : rows, error: null }
        }
      } else if (op === 'update') {
        const hit = (tables[table] || []).filter((r) => filters.every((f) => f(r)))
        for (const r of hit) Object.assign(r, payload)
        result = { data: single ? (hit[0] || null) : hit, error: null }
      } else if (op === 'delete') {
        const keep = (tables[table] || []).filter((r) => !filters.every((f) => f(r)))
        const removed = (tables[table] || []).length - keep.length
        tables[table] = keep
        result = { data: null, count: removed, error: null }
      } else {
        let rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)))
        if (orderCol) {
          const c = orderCol
          rows = [...rows].sort((a, z) => {
            const x = a[c], y = z[c]
            if (x === y) return 0
            return (x > y ? 1 : -1) * (orderAsc ? 1 : -1)
          })
        }
        if (rangeFrom != null) rows = rows.slice(rangeFrom, (rangeTo ?? rows.length) + 1)
        if (limitN != null) rows = rows.slice(0, limitN)
        result = head
          ? { data: null, count: rows.length, error: null }
          : single
            ? { data: rows[0] || null, error: null }
            : { data: rows, count: rows.length, error: null }
      }
      return Promise.resolve(result).then(resolve, reject)
    }
    return b
  }

  return {
    tables,
    calls,
    from: (table: string) => builder(table),
    defineRpc(name, fn) { rpcs[name] = fn },
    async rpc(name, args = {}) {
      calls.push(['<rpc>', name, [args]])
      const fn = rpcs[name]
      // Sem registro: como um banco que ainda não tem a função. É o que
      // faz o código exercitar o caminho de reserva.
      if (!fn) return { data: null, error: { code: '42883', message: `function ${name} does not exist` } }
      return { data: fn(args), error: null }
    },
    seed(table, rows) { tables[table] = rows.map((r) => ({ ...r })) },
    unique(table, cols) { uniques[table] = [...(uniques[table] || []), cols] },
    reset() {
      for (const k of Object.keys(tables)) delete tables[k]
      for (const k of Object.keys(uniques)) delete uniques[k]
      for (const k of Object.keys(rpcs)) delete rpcs[k]
      calls.length = 0
    },
  }
}
