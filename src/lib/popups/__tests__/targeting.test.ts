import { describe, it, expect } from 'vitest'
import {
  readAudienceTargeting,
  audienceGateEnabled,
  trafficTypeOrNull,
  pageKindOrNull,
  audienceBlockReason,
  isMemberOfAudience,
  TRAFFIC_TYPES,
  PAGE_TEMPLATES,
} from '../targeting'

const SEG = '11111111-1111-4111-8111-111111111111'
const LIST = '22222222-2222-4222-8222-222222222222'

describe('leitura do targeting de audiência', () => {
  it('só aceita modo conhecido e UUIDs; sem ids vira "off"', () => {
    expect(readAudienceTargeting({ audienceTargeting: { mode: 'include', segmentIds: [SEG, 'x', SEG], listIds: [LIST] } }))
      .toEqual({ mode: 'include', segmentIds: [SEG], listIds: [LIST] })
    expect(readAudienceTargeting({ audienceTargeting: { mode: 'include', segmentIds: [], listIds: [] } }).mode).toBe('off')
    expect(readAudienceTargeting({ audienceTargeting: { mode: 'hack', segmentIds: [SEG] } }).mode).toBe('off')
    expect(readAudienceTargeting({}).mode).toBe('off')
    expect(audienceGateEnabled({ audienceTargeting: { mode: 'exclude', listIds: [LIST] } })).toBe(true)
  })

  it('tem teto de 50 ids', () => {
    const ids = Array.from({ length: 80 }, (_, i) => `33333333-3333-4333-8333-${String(i).padStart(12, '0')}`)
    expect(readAudienceTargeting({ audienceTargeting: { mode: 'include', segmentIds: ids } }).segmentIds).toHaveLength(50)
  })
})

describe('vocabulário fechado de origem e página', () => {
  it('aceita só as chaves conhecidas', () => {
    for (const t of TRAFFIC_TYPES) expect(trafficTypeOrNull(t.key)).toBe(t.key)
    for (const p of PAGE_TEMPLATES) expect(pageKindOrNull(p.key)).toBe(p.key)
    expect(trafficTypeOrNull('DROP TABLE')).toBeNull()
    expect(trafficTypeOrNull(3)).toBeNull()
    expect(pageKindOrNull('checkout')).toBeNull()
  })
})

// Um cliente Supabase de mentira: cada from(table) devolve o que o teste
// programou, e registra os filtros para conferir o escopo por org.
function fakeAdmin(tables: Record<string, any[]>) {
  const log: Array<{ table: string; filters: string[] }> = []
  const client: any = {
    from(table: string) {
      const entry = { table, filters: [] as string[] }
      log.push(entry)
      const rows = tables[table] || []
      const q: any = {
        select: () => q,
        eq: (k: string, v: any) => { entry.filters.push(`eq:${k}=${v}`); return q },
        in: (k: string, v: any[]) => { entry.filters.push(`in:${k}=${v.join('|')}`); return q },
        not: (k: string) => { entry.filters.push(`not:${k}`); return q },
        order: () => q,
        limit: () => q,
        contains: (k: string, v: any[]) => { entry.filters.push(`contains:${k}=${v.join('|')}`); return q },
        maybeSingle: async () => ({ data: rows[0] || null }),
        then: (res: any) => Promise.resolve({ data: rows }).then(res),
      }
      return q
    },
  }
  return { client, log }
}

describe('gate de audiência no servidor', () => {
  const inc = { mode: 'include' as const, segmentIds: [SEG], listIds: [LIST] }
  const exc = { mode: 'exclude' as const, segmentIds: [SEG], listIds: [] }

  it('desconhecido: bloqueado em "somente quem está", liberado em "exceto quem está"', async () => {
    const { client } = fakeAdmin({})
    expect(await audienceBlockReason(client, 'org', null, inc)).toBe('not_in_audience')
    expect(await audienceBlockReason(client, 'org', null, exc)).toBeNull()
    expect(await audienceBlockReason(client, 'org', null, { mode: 'off', segmentIds: [], listIds: [] })).toBeNull()
  })

  it('membro de lista libera o include e bloqueia o exclude', async () => {
    const { client, log } = fakeAdmin({ contact_lists: [{ id: LIST }], contact_list_members: [{ list_id: LIST }] })
    expect(await isMemberOfAudience(client, 'org', 'ct', inc)).toEqual({ member: true, via: 'list' })
    // A lista foi verificada como da org antes de olhar os membros.
    expect(log.find((l) => l.table === 'contact_lists')!.filters).toContain('eq:organization_id=org')
    expect(await audienceBlockReason(client, 'org', 'ct', { ...exc, segmentIds: [], listIds: [LIST] })).toBe('in_excluded_audience')
  })

  it('segmento dinâmico consulta o snapshot da org com contains', async () => {
    const { client, log } = fakeAdmin({
      customer_segments: [{ id: SEG, segment_type: 'dynamic' }],
      segment_memberships_snapshot: [{ segment_id: SEG }],
    })
    expect(await isMemberOfAudience(client, 'org', 'ct', { ...inc, listIds: [] })).toEqual({ member: true, via: 'segment_dynamic' })
    const snap = log.find((l) => l.table === 'segment_memberships_snapshot')!
    expect(snap.filters).toContain('eq:organization_id=org')
    expect(snap.filters).toContain('contains:contact_ids=ct')
  })

  it('segmento de outra org não conta: a consulta filtra organization_id e não acha nada', async () => {
    const { client } = fakeAdmin({ customer_segments: [], segment_members: [{ segment_id: SEG }] })
    expect(await isMemberOfAudience(client, 'org', 'ct', { ...inc, listIds: [] })).toEqual({ member: false, via: null })
    expect(await audienceBlockReason(client, 'org', 'ct', { ...inc, listIds: [] })).toBe('not_in_audience')
  })
})
