// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import type { SegmentRule } from '@/lib/segments/dsl'

vi.mock('@/stores', () => ({ useAuthStore: () => ({ user: { organization_id: 'org-1' } }) }))
vi.mock('@/components/integrations/shopify/ShopifyImportModal', () => ({ default: () => null }))

let root: Root
let container: HTMLDivElement
let KnowledgeBasePanel: typeof import('@/components/agents/KnowledgeBasePanel').default
let PipelineAutomationConfig: typeof import('@/components/crm/PipelineAutomationConfig').PipelineAutomationConfig
let LivePreviewPanel: typeof import('@/components/segments/v2/LivePreviewPanel').LivePreviewPanel

beforeEach(async () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;({ default: KnowledgeBasePanel } = await import('@/components/agents/KnowledgeBasePanel'))
  ;({ PipelineAutomationConfig } = await import('@/components/crm/PipelineAutomationConfig'))
  ;({ LivePreviewPanel } = await import('@/components/segments/v2/LivePreviewPanel'))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('loads Knowledge Base sources once after choosing its fallback agent', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => String(input) === '/api/ai/agents'
    ? { json: async () => [{ id: 'agent-1', name: 'Agent', description: '', is_active: true }] }
    : { ok: true, json: async () => [] })
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<KnowledgeBasePanel organizationId="org-1" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/ai/agents/agent-1/sources'))
  expect(fetchMock.mock.calls.filter(([url]) => String(url) === '/api/ai/agents')).toHaveLength(1)
  expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/sources'))).toHaveLength(1)
})

it('loads pipeline automations once while assigning its fallback stage', async () => {
  const fetchMock = vi.fn(async () => ({ json: async () => ({ success: true, data: { rules: [], sources: [{ type: 'shopify', name: 'Shopify', connected: true }] } }) }))
  vi.stubGlobal('fetch', fetchMock)
  await act(async () => { root.render(<PipelineAutomationConfig pipelineId="pipeline-1" stages={[{ id: 'stage-1', name: 'New', color: '#fff' }]} />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  expect((container.querySelectorAll('select')[1] as HTMLSelectElement).value).toBe('stage-1')
  expect(fetchMock).toHaveBeenCalledWith('/api/pipelines/pipeline-1/automations?organizationId=org-1')
})

it('keeps one debounce for an equivalent rule rerender and sends the latest snapshot', async () => {
  vi.useFakeTimers()
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => ({ ok: true, json: async () => ({ count: 1, truncated: false, sample: [] }) }))
  vi.stubGlobal('fetch', fetchMock)
  const rule: SegmentRule = { version: 2, root: { type: 'group', logic: 'AND', children: [{ type: 'profile', field: 'email', operator: 'is_set' } as any] } }
  const equivalentRule = JSON.parse(JSON.stringify(rule)) as SegmentRule
  const updatedRule: SegmentRule = { ...equivalentRule, root: { ...equivalentRule.root, logic: 'OR' } }
  await act(async () => { root.render(<LivePreviewPanel rule={rule} organizationId="org-1" storeId="store-1" />) })
  await act(async () => { vi.advanceTimersByTime(250) })
  await act(async () => { root.render(<LivePreviewPanel rule={equivalentRule} organizationId="org-1" storeId="store-1" />) })
  await act(async () => { vi.advanceTimersByTime(250) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
  expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toEqual({ rule: equivalentRule, organization_id: 'org-1', store_id: 'store-1' })

  await act(async () => { root.render(<LivePreviewPanel rule={updatedRule} organizationId="org-1" storeId="store-1" />) })
  await act(async () => { vi.advanceTimersByTime(499) })
  expect(fetchMock).toHaveBeenCalledTimes(1)
  await act(async () => { vi.advanceTimersByTime(1) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
  expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string)).toEqual({ rule: updatedRule, organization_id: 'org-1', store_id: 'store-1' })
})