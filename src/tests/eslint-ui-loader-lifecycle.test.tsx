// @vitest-environment jsdom

import React, { act } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRoot, type Root } from 'react-dom/client'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@/lib/supabase-client', () => ({
  supabaseClient: {
    channel: () => ({
      on() { return this },
      subscribe: () => ({}),
    }),
    removeChannel: vi.fn(),
  },
}))

let root: Root
let container: HTMLDivElement
let NotificationPanel: typeof import('@/components/notifications/NotificationPanel').NotificationPanel
let TransferModal: typeof import('@/components/whatsapp/inbox/modals/TransferModal').TransferModal

const response = (data: unknown) => ({ ok: true, json: async () => data })

beforeEach(async () => {
  vi.stubGlobal('React', React)
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true)
  ;({ NotificationPanel } = await import('@/components/notifications/NotificationPanel'))
  ;({ TransferModal } = await import('@/components/whatsapp/inbox/modals/TransferModal'))
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

it('loads notifications once when the panel mounts', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => response({ notifications: [], unread_count: 0, total: 0 }))
  vi.stubGlobal('fetch', fetchMock)

  await act(async () => { root.render(<NotificationPanel organizationId="org-1" userId="user-1" />) })

  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/notifications?'))).toHaveLength(1))
})

it('does not load transfer agents while closed and loads them once when opened', async () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL) => response({ data: [] }))
  vi.stubGlobal('fetch', fetchMock)
  const props = { onClose: vi.fn(), onTransfer: vi.fn(), organizationId: 'org-1', conversationId: 'conversation-1' }

  await act(async () => { root.render(<TransferModal {...props} isOpen={false} />) })
  expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/whatsapp/agents/status?'))).toHaveLength(0)

  await act(async () => { root.render(<TransferModal {...props} isOpen />) })
  await vi.waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/whatsapp/agents/status?'))).toHaveLength(1))
})
