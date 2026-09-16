// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'
import { useFlowStore } from '@/stores/flowStore'

vi.mock('@/stores', () => ({ useAuthStore: () => ({ user: { organization_id: 'org-1' } }) }))

let root: Root
let container: HTMLDivElement
let AutomationLogsModal: typeof import('@/components/crm/automations/AutomationLogsModal').AutomationLogsModal
let EmailPreviewMode: typeof import('@/components/flow-builder/panels/EmailPreviewMode').EmailPreviewMode
let PropertiesPanel: typeof import('@/components/flow-builder/panels/PropertiesPanel').PropertiesPanel

const response = (data: unknown, ok = true) => ({ ok, json: async () => data })

beforeEach(async () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;({ AutomationLogsModal } = await import('@/components/crm/automations/AutomationLogsModal'))
  ;({ EmailPreviewMode } = await import('@/components/flow-builder/panels/EmailPreviewMode'))
  ;({ PropertiesPanel } = await import('@/components/flow-builder/panels/PropertiesPanel'))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  useFlowStore.setState({ nodes: [], selectedNodeId: null, showPropertiesPanel: false })
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('resets logs once when a filter changes', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const page = String(input).includes('page=2') ? '2' : '1'
    const logs = Array.from({ length: 50 }, (_, index) => ({
      id: `${page}-${index}`, status: 'success', source_type: 'shopify', event_type: 'placed_order', message: 'ok', created_at: '2026-01-01',
    }))
    return response({ logs })
  })
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<AutomationLogsModal isOpen onClose={vi.fn()} />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))

  const loadMore = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Carregar mais')!
  await act(async () => { loadMore.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))

  const status = container.querySelector('select') as HTMLSelectElement
  await act(async () => {
    status.value = 'success'
    status.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3))
  expect(String(fetchMock.mock.calls[2][0])).toContain('page=1')
  expect(String(fetchMock.mock.calls[2][0])).toContain('status=success')
})

it('loads one event list and renders its latest preview payload', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(init?.body as string)
    return body.action === 'list_events'
      ? response({ events: [{ id: 'event-2', contact_id: 'contact-2', event_type: 'placed_order', properties: {}, occurred_at: '2026-01-02' }] })
      : response({ html: '<p>latest preview</p>', contact: { id: body.contactId } })
  })
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => {
    root.render(<EmailPreviewMode templateId="template-1" triggerType="trigger_order" organizationId="org-1" onClose={vi.fn()} />)
  })

  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([, init]) => JSON.parse((init as RequestInit).body as string).action === 'list_events')).toHaveLength(1))
  await vi.waitFor(() => expect((document.querySelector('iframe') as HTMLIFrameElement | null)?.srcdoc).toContain('latest preview'))
  expect(JSON.parse((fetchMock.mock.calls[1][1] as RequestInit).body as string).contactId).toBe('contact-2')
})

it('reloads store, user, and pipeline data after organization A changes to B', async () => {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.startsWith('/api/stores')) return response({ stores: [] })
    if (url === '/api/settings/users') return response({ members: [] })
    if (url.startsWith('/api/deals')) return response({ pipelines: [{ id: 'pipeline-1', name: 'Pipeline', stages: [] }] })
    return response({})
  })
  vi.stubGlobal('fetch', fetchMock)

  const node = (id: string, nodeType: string) => ({ id, type: nodeType, data: { nodeType, category: nodeType.startsWith('trigger') ? 'trigger' : 'action', config: {}, label: nodeType } })
  await act(async () => { useFlowStore.setState({ nodes: [node('store', 'trigger_order')] as any, selectedNodeId: 'store', showPropertiesPanel: true }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stores?organizationId=org-a'))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-b" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/stores?organizationId=org-b'))

  await act(async () => { useFlowStore.setState({ nodes: [node('users', 'action_notify')] as any, selectedNodeId: 'users' }) })
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/settings/users')).toHaveLength(1))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => url === '/api/settings/users')).toHaveLength(2))

  await act(async () => { useFlowStore.setState({ nodes: [node('pipeline', 'trigger_deal_stage')] as any, selectedNodeId: 'pipeline' }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/deals?type=pipelines&organizationId=org-a'))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-b" />) })
  await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/deals?type=pipelines&organizationId=org-b'))
})
