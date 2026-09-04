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
  tables: Record<string, Row[]>
  /** Chamadas registradas: [tabela, método, argumentos]. */
  calls: Array<[string, string, any[]]>
  seed: (table: string, rows: Row[]) => void
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
  const calls: Array<[string, string, any[]]> = []

  function builder(table: string) {
    const filters: Array<(r: Row) => boolean> = []
    let limitN: number | null = null
    let single = false
    let head = false
    let orderCol: string | null = null
    let orderAsc = true
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
    chain('order', (col: string, opts?: { ascending?: boolean }) => { orderCol = col; orderAsc = opts?.ascending !== false })
    chain('limit', (n: number) => { limitN = n })
    chain('range', () => {})
    chain('single', () => { single = true })
    chain('maybeSingle', () => { single = true })
    chain('update', () => {})
    chain('insert', () => {})
    b.then = (resolve: any, reject: any) => {
      let rows = (tables[table] || []).filter((r) => filters.every((f) => f(r)))
      if (orderCol) {
        const c = orderCol
        rows = [...rows].sort((a, z) => {
          const x = a[c], y = z[c]
          if (x === y) return 0
          return (x > y ? 1 : -1) * (orderAsc ? 1 : -1)
        })
      }
      if (limitN != null) rows = rows.slice(0, limitN)
      const result = head
        ? { data: null, count: rows.length, error: null }
        : single
          ? { data: rows[0] || null, error: null }
          : { data: rows, count: rows.length, error: null }
      return Promise.resolve(result).then(resolve, reject)
    }
    return b
  }

  return {
    tables,
    calls,
    from: (table: string) => builder(table),
    seed(table, rows) { tables[table] = rows.map((r) => ({ ...r })) },
    reset() { for (const k of Object.keys(tables)) delete tables[k]; calls.length = 0 },
  }
}
