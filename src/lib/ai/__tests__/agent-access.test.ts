import { describe, it, expect, vi } from 'vitest'
import { assertAgentInOrg } from '../agent-access'

function mockSupabase(result: { data: any; error: any }) {
  const single = vi.fn().mockResolvedValue(result)
  const eq2 = vi.fn().mockReturnValue({ single })
  const eq1 = vi.fn().mockReturnValue({ eq: eq2 })
  const select = vi.fn().mockReturnValue({ eq: eq1 })
  const from = vi.fn().mockReturnValue({ select })
  return { client: { from } as any, from, eq1, eq2 }
}

describe('assertAgentInOrg', () => {
  it('retorna ok quando o agente pertence à org', async () => {
    const { client, eq1, eq2 } = mockSupabase({ data: { id: 'a1' }, error: null })
    const res = await assertAgentInOrg(client, 'a1', 'org1')
    expect(res.ok).toBe(true)
    expect(eq1).toHaveBeenCalledWith('id', 'a1')
    expect(eq2).toHaveBeenCalledWith('organization_id', 'org1')
  })

  it('retorna 404 quando o agente não pertence à org', async () => {
    const { client } = mockSupabase({ data: null, error: { message: 'not found' } })
    const res = await assertAgentInOrg(client, 'a1', 'org-de-outro')
    expect(res).toEqual({ ok: false, status: 404, error: 'Agente não encontrado' })
  })

  it('retorna 400 quando organizationId está vazio', async () => {
    const { client, from } = mockSupabase({ data: null, error: null })
    const res = await assertAgentInOrg(client, 'a1', '')
    expect(res).toEqual({ ok: false, status: 400, error: 'organization_id é obrigatório' })
    expect(from).not.toHaveBeenCalled()
  })
})
