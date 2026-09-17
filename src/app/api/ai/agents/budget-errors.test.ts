import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { AiBudgetExceededError, AiBudgetUnavailableError } from '@/lib/ai/budget'

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  runEvaluation: vi.fn(),
  listEval: vi.fn(),
  generateProposals: vi.fn(),
  listProposals: vi.fn(),
  runScenarios: vi.fn(),
  generateScenarios: vi.fn(),
  listScenarios: vi.fn(),
}))

const chain = (result: unknown) => {
  const value: any = {
    select: vi.fn(() => value),
    eq: vi.fn(() => value),
    order: vi.fn(() => value),
    single: vi.fn().mockResolvedValue(result),
    then: (resolve: (x: unknown) => void) => Promise.resolve(result).then(resolve),
  }
  return value
}

vi.mock('@/lib/api-utils', () => ({
  getAuthClient: () => mocks.auth(),
}))

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => table === 'ai_agents'
      ? chain({ data: { id: 'agent-1', system_prompt: '' }, error: null })
      : chain({ count: 1, data: [], error: null }),
  }),
}))

vi.mock('@/lib/ai/evals', () => ({
  runEvaluation: (...args: unknown[]) => mocks.runEvaluation(...args),
  listEval: (...args: unknown[]) => mocks.listEval(...args),
}))

vi.mock('@/lib/ai/proposals', () => ({
  generateProposals: (...args: unknown[]) => mocks.generateProposals(...args),
  listProposals: (...args: unknown[]) => mocks.listProposals(...args),
}))

vi.mock('@/lib/ai/test-runner', () => ({
  runScenarios: (...args: unknown[]) => mocks.runScenarios(...args),
  generateScenarios: (...args: unknown[]) => mocks.generateScenarios(...args),
  listScenariosWithLatestRun: (...args: unknown[]) => mocks.listScenarios(...args),
}))

import { POST as postEvals } from './[id]/evals/route'
import { POST as postProposals } from './[id]/proposals/generate/route'
import { POST as postTestRuns } from './[id]/test-runs/route'

const request = () => new NextRequest('http://localhost/api/ai/agents/agent-1', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
})
const context = { params: { id: 'agent-1' } }

describe('AI agent routes preserve budget error status', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.auth.mockResolvedValue({ user: { id: 'user-1', organization_id: 'org-1' } })
    mocks.listEval.mockResolvedValue({})
    mocks.listProposals.mockResolvedValue([])
    mocks.listScenarios.mockResolvedValue([])
    mocks.generateScenarios.mockResolvedValue([])
  })

  it.each([
    ['evals', postEvals, mocks.runEvaluation],
    ['proposals', postProposals, mocks.generateProposals],
    ['test-runs', postTestRuns, mocks.runScenarios],
  ])('%s returns 503 with the unknown reason', async (_name, handler, operation) => {
    operation.mockRejectedValueOnce(new AiBudgetUnavailableError('lookup_error'))

    const response = await handler(request(), context)
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body).toMatchObject({
      code: 'AI_BUDGET_UNAVAILABLE',
      unknownReason: 'lookup_error',
    })
  })

  it.each([
    ['evals', postEvals, mocks.runEvaluation],
    ['proposals', postProposals, mocks.generateProposals],
    ['test-runs', postTestRuns, mocks.runScenarios],
  ])('%s keeps known budget exhaustion as 402', async (_name, handler, operation) => {
    operation.mockRejectedValueOnce(new AiBudgetExceededError(50, 50))

    const response = await handler(request(), context)

    expect(response.status).toBe(402)
  })
})
