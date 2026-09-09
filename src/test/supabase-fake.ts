// =============================================
// Supabase de mentira para testar ROTAS de verdade.
//
// Os testes unitários provam que cada peça está certa. Os bugs desta
// safra nasceram entre as peças: o endereço congelado que vencia a
// identidade da loja, o gate de origem que não existia, o filtro de
// organização que faltava numa consulta. Nenhum deles apareceria num
// teste de função pura.
//
// Aqui a rota roda inteira — requisição entra, resposta sai — com este
// cliente no lugar do Supabase. Ele registra cada consulta (tabela,
// filtros, escrita) para o teste afirmar sobre o ESCOPO, que é onde mora
// a segurança multi-tenant, e devolve as linhas que o teste preparou.
//
// Não é um Postgres: não avalia filtros. Se um teste precisa de linhas
// diferentes para a mesma tabela, use `rowsFor` com uma função.
// =============================================

export interface RecordedQuery {
  table: string
  /** eq/neq/in/gte/... na ordem em que foram encadeados. */
  filters: Array<{ op: string; column: string; value: any }>
  /** O objeto passado a update/insert/upsert, quando houve escrita. */
  written?: Record<string, any>
  operation: 'select' | 'insert' | 'update' | 'upsert' | 'delete'
  /** Colunas pedidas no select. */
  columns?: string
}

export interface FakeSupabaseOptions {
  /** Linhas por tabela. Uma função recebe a consulta e decide. */
  rows?: Record<string, any[] | ((q: RecordedQuery) => any[])>
  /** Resposta de rpc por nome. */
  rpc?: Record<string, any>
  /** Erro por tabela, para testar o caminho de falha. */
  errors?: Record<string, { message: string; code?: string }>
}

export interface FakeSupabase {
  from: (table: string) => any
  rpc: (name: string, args?: any) => Promise<{ data: any; error: any }>
  /** Tudo o que a rota consultou, em ordem. */
  queries: RecordedQuery[]
  /** Só as consultas de uma tabela. */
  on: (table: string) => RecordedQuery[]
  /** As chamadas de rpc, em ordem. */
  rpcCalls: Array<{ name: string; args: any }>
}

export function fakeSupabase(options: FakeSupabaseOptions = {}): FakeSupabase {
  const queries: RecordedQuery[] = []
  const rpcCalls: Array<{ name: string; args: any }> = []

  const resolveRows = (q: RecordedQuery): any[] => {
    const r = options.rows?.[q.table]
    if (typeof r === 'function') return r(q)
    return r || []
  }

  const client: FakeSupabase = {
    queries,
    rpcCalls,
    on: (table: string) => queries.filter((q) => q.table === table),
    async rpc(name: string, args?: any) {
      rpcCalls.push({ name, args })
      const data = options.rpc?.[name]
      return { data: data === undefined ? null : data, error: null }
    },
    from(table: string) {
      const q: RecordedQuery = { table, filters: [], operation: 'select' }
      queries.push(q)

      // `head: true` pede só a contagem. O cliente real segue encadeável
      // depois disso (.eq/.gte vêm DEPOIS do select), e o await no fim
      // devolve `count` com `data: null`.
      let headOnly = false
      const settle = () => {
        const err = options.errors?.[table]
        if (err) return { data: null, error: err, count: null }
        const rows = resolveRows(q)
        return { data: headOnly ? null : rows, error: null, count: rows.length }
      }
      const single = () => {
        const s = settle()
        if (s.error) return s
        const row = (s.data as any[])[0]
        return { data: row ?? null, error: row ? null : { message: 'No rows found', code: 'PGRST116' } }
      }
      const maybeSingle = () => {
        const s = settle()
        if (s.error) return s
        return { data: (s.data as any[])[0] ?? null, error: null }
      }

      const filter = (op: string) => (column: string, value?: any) => {
        q.filters.push({ op, column, value })
        return builder
      }

      const builder: any = {
        select(columns?: string, opts?: { count?: string; head?: boolean }) {
          if (q.operation === 'select') q.columns = columns
          if (opts?.head) headOnly = true
          return builder
        },
        insert(payload: any) { q.operation = 'insert'; q.written = payload; return builder },
        update(payload: any) { q.operation = 'update'; q.written = payload; return builder },
        upsert(payload: any) { q.operation = 'upsert'; q.written = payload; return builder },
        delete() { q.operation = 'delete'; return builder },
        eq: filter('eq'),
        neq: filter('neq'),
        gt: filter('gt'),
        gte: filter('gte'),
        lt: filter('lt'),
        lte: filter('lte'),
        is: filter('is'),
        in: filter('in'),
        or: filter('or'),
        not: (column: string, op: string, value: any) => { q.filters.push({ op: `not.${op}`, column, value }); return builder },
        contains: filter('contains'),
        order: () => builder,
        limit: () => builder,
        range: () => builder,
        single,
        maybeSingle,
        then: (resolve: any, reject?: any) => Promise.resolve(settle()).then(resolve, reject),
      }
      return builder
    },
  }
  return client
}

/** O filtro `column = value` foi aplicado nesta consulta? */
export function hasFilter(q: RecordedQuery, column: string, value?: any): boolean {
  return q.filters.some((f) => f.column === column && (value === undefined || f.value === value))
}

/** Toda consulta a estas tabelas está presa à organização? */
export function allScopedToOrg(queries: RecordedQuery[], orgId: string, tables: string[]): boolean {
  return queries
    .filter((q) => tables.includes(q.table))
    .every((q) => hasFilter(q, 'organization_id', orgId))
}
