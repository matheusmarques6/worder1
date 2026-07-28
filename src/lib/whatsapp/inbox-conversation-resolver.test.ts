import { describe, it, expect } from 'vitest'
import { resolveInboxConversation } from './inbox-conversation-resolver'

// Mock por tabela: from(table) -> chain com select/eq/maybeSingle
function makeSupabaseMock(results: Record<string, { data: any; error: any }>) {
  const queried: string[] = []
  const client = {
    from: (table: string) => {
      queried.push(table)
      const chain: any = {
        select: () => chain,
        eq: () => chain,
        maybeSingle: async () => results[table] ?? { data: null, error: null },
      }
      return chain
    },
  } as any
  return { client, queried }
}

describe('resolveInboxConversation', () => {
  const cloudRow = { id: 'c1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1' }
  const legacyRow = { id: 'c1', organization_id: 'org-1', status: 'open', contact_id: 'ct-1', unified_contact_id: 'uc-1' }

  it('encontra na cloud primeiro e nem consulta a legacy', async () => {
    const { client, queried } = makeSupabaseMock({
      whatsapp_cloud_conversations: { data: cloudRow, error: null },
    })
    const resolved = await resolveInboxConversation(client, 'c1', 'org-1')
    expect(resolved).toEqual({
      table: 'whatsapp_cloud_conversations',
      provider: 'cloud',
      row: cloudRow,
    })
    expect(queried).toEqual(['whatsapp_cloud_conversations'])
  })

  it('faz fallback para a legacy quando nao esta na cloud', async () => {
    const { client, queried } = makeSupabaseMock({
      whatsapp_conversations: { data: legacyRow, error: null },
    })
    const resolved = await resolveInboxConversation(client, 'c1', 'org-1')
    expect(resolved).toEqual({
      table: 'whatsapp_conversations',
      provider: 'evolution',
      row: legacyRow,
    })
    expect(queried).toEqual(['whatsapp_cloud_conversations', 'whatsapp_conversations'])
  })

  it('retorna null quando nao existe em nenhuma tabela', async () => {
    const { client } = makeSupabaseMock({})
    const resolved = await resolveInboxConversation(client, 'missing', 'org-1')
    expect(resolved).toBeNull()
  })

  it('propaga erro de banco da consulta cloud', async () => {
    const { client } = makeSupabaseMock({
      whatsapp_cloud_conversations: { data: null, error: { message: 'boom' } },
    })
    await expect(resolveInboxConversation(client, 'c1', 'org-1')).rejects.toBeTruthy()
  })

  it('propaga erro de banco da consulta legacy', async () => {
    const { client } = makeSupabaseMock({
      whatsapp_conversations: { data: null, error: { message: 'boom' } },
    })
    await expect(resolveInboxConversation(client, 'c1', 'org-1')).rejects.toBeTruthy()
  })
})
