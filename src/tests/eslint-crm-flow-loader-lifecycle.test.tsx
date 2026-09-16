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
const deferred = <T,>() => {
  let resolve!: (value: T) => void
  return { promise: new Promise<T>((done) => { resolve = done }), resolve }
}

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

it('ignores a stale log page after a filter reset', async () => {
  const requests: Array<{ url: string; result: ReturnType<typeof deferred<any>> }> = []
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const result = deferred<any>()
    requests.push({ url: String(input), result })
    return result.promise
  })
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<AutomationLogsModal isOpen onClose={vi.fn()} />) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { requests[0].result.resolve(response({ logs: Array.from({ length: 50 }, (_, index) => ({ id: `initial-${index}`, status: 'success', source_type: 'shopify', event_type: 'placed_order', message: 'initial', created_at: '2026-01-01' })) })) })

  const loadMore = [...container.querySelectorAll('button')].find((button) => button.textContent === 'Carregar mais')!
  await act(async () => { loadMore.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))

  const status = container.querySelector('select') as HTMLSelectElement
  await act(async () => {
    status.value = 'success'
    status.dispatchEvent(new Event('change', { bubbles: true }))
  })

  await vi.waitFor(() => expect(requests).toHaveLength(3))
  expect(requests[2].url).toContain('page=1')
  await act(async () => { requests[2].result.resolve(response({ logs: [{ id: 'current', status: 'success', source_type: 'shopify', event_type: 'placed_order', message: 'current filter', created_at: '2026-01-01' }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('current filter'))
  await act(async () => { requests[1].result.resolve(response({ logs: [{ id: 'stale', status: 'success', source_type: 'shopify', event_type: 'placed_order', message: 'stale page', created_at: '2026-01-01' }] })) })
  await vi.waitFor(() => expect(container.textContent).not.toContain('stale page'))
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

it('keeps the newer preview when the older preview resolves last', async () => {
  const requests: Array<{ body: any; result: ReturnType<typeof deferred<any>> }> = []
  const fetchMock = vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
    const result = deferred<any>()
    requests.push({ body: JSON.parse(init?.body as string), result })
    return result.promise
  })
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<EmailPreviewMode templateId="template-a" triggerType="trigger_order" organizationId="org-a" onClose={vi.fn()} />) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { requests[0].result.resolve(response({ events: [{ id: 'event-a', contact_id: 'contact-a', event_type: 'placed_order', properties: {}, occurred_at: '2026-01-01' }] })) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))

  await act(async () => { root.render(<EmailPreviewMode templateId="template-b" triggerType="trigger_order" organizationId="org-b" onClose={vi.fn()} />) })
  await vi.waitFor(() => expect(requests).toHaveLength(3))
  await act(async () => { requests[2].result.resolve(response({ events: [{ id: 'event-b', contact_id: 'contact-b', event_type: 'placed_order', properties: {}, occurred_at: '2026-01-02' }] })) })
  await vi.waitFor(() => expect(requests).toHaveLength(4))
  await act(async () => { requests[3].result.resolve(response({ html: '<p>preview b</p>', contact: { id: 'contact-b' } })) })
  await vi.waitFor(() => expect((document.querySelector('iframe') as HTMLIFrameElement).srcdoc).toContain('preview b'))
  await act(async () => { requests[1].result.resolve(response({ html: '<p>preview a</p>', contact: { id: 'contact-a' } })) })
  await vi.waitFor(() => expect((document.querySelector('iframe') as HTMLIFrameElement).srcdoc).toContain('preview b'))
})

it('keeps organization B pipelines when organization A resolves last', async () => {
  const requests: Array<{ url: string; result: ReturnType<typeof deferred<any>> }> = []
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const result = deferred<any>()
    requests.push({ url: String(input), result })
    return result.promise
  })
  vi.stubGlobal('fetch', fetchMock)

  const node = (id: string, nodeType: string) => ({ id, type: nodeType, data: { nodeType, category: nodeType.startsWith('trigger') ? 'trigger' : 'action', config: {}, label: nodeType } })
  await act(async () => { useFlowStore.setState({ nodes: [node('pipeline', 'trigger_deal_stage')] as any, selectedNodeId: 'pipeline', showPropertiesPanel: true }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-b" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await act(async () => { requests[1].result.resolve(response({ pipelines: [{ id: 'b', name: 'Pipeline B', stages: [] }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('Pipeline B'))
  await act(async () => { requests[0].result.resolve(response({ pipelines: [{ id: 'a', name: 'Pipeline A', stages: [] }] })) })
  await vi.waitFor(() => expect(container.textContent).not.toContain('Pipeline A'))
})

it('clears pipeline loading when organization becomes unavailable', async () => {
  const pending = deferred<any>()
  vi.stubGlobal('fetch', vi.fn(() => pending.promise))
  const node = { id: 'pipeline', type: 'trigger_deal_stage', data: { nodeType: 'trigger_deal_stage', category: 'trigger', config: {}, label: 'Pipeline' } }
  await act(async () => { useFlowStore.setState({ nodes: [node] as any, selectedNodeId: 'pipeline', showPropertiesPanel: true }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(true))
  await act(async () => { root.render(<PropertiesPanel />) })
  await vi.waitFor(() => expect((container.querySelector('select') as HTMLSelectElement).disabled).toBe(false))
})

it('keeps organization B stores when A resolves last', async () => {
  const requests: Array<ReturnType<typeof deferred<any>>> = []
  vi.stubGlobal('fetch', vi.fn(() => {
    const result = deferred<any>()
    requests.push(result)
    return result.promise
  }))
  const node = { id: 'stores', type: 'trigger_order', data: { nodeType: 'trigger_order', category: 'trigger', config: {}, label: 'Order' } }
  await act(async () => { useFlowStore.setState({ nodes: [node] as any, selectedNodeId: 'stores', showPropertiesPanel: true }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-b" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await act(async () => { requests[1].resolve(response({ stores: [{ id: 'b', name: 'Store B' }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('Store B'))
  await act(async () => { requests[0].resolve(response({ stores: [{ id: 'a', name: 'Store A' }] })) })
  await vi.waitFor(() => expect(container.textContent).not.toContain('Store A'))
})

it('keeps organization A users when organization B resolves last', async () => {
  const requests: Array<ReturnType<typeof deferred<any>>> = []
  vi.stubGlobal('fetch', vi.fn(() => {
    const result = deferred<any>()
    requests.push(result)
    return result.promise
  }))

  const node = { id: 'users', type: 'action_notify', data: { nodeType: 'action_notify', category: 'action', config: {}, label: 'Notify' } }
  await act(async () => { useFlowStore.setState({ nodes: [node] as any, selectedNodeId: 'users', showPropertiesPanel: true }) })
  await act(async () => { root.render(<PropertiesPanel organizationId="org-b" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(1))
  await act(async () => { root.render(<PropertiesPanel organizationId="org-a" />) })
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  await act(async () => { requests[1].resolve(response({ members: [{ user_id: 'a', profiles: { email: 'a@example.com' } }] })) })
  await vi.waitFor(() => expect(container.textContent).toContain('a@example.com'))
  await act(async () => { requests[0].resolve(response({ members: [{ user_id: 'b', profiles: { email: 'b@example.com' } }] })) })
  await vi.waitFor(() => expect(container.textContent).not.toContain('b@example.com'))
})
