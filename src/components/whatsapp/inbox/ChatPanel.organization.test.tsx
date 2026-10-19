// @vitest-environment jsdom
import React, { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ChatPanel } from './ChatPanel'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api/authed-fetch', () => ({
  authedFetch: vi.fn(async () => ({ ok: true, json: async () => ({ status: { willRespond: true, label: 'Ativo' } }) })),
}))
vi.mock('./useServiceWindow', () => ({ useServiceWindow: () => ({ isOpen: true, status: 'open' }) }))
vi.mock('./AudioRecorder', () => ({ AudioRecorder: () => null }))
vi.mock('./ServiceWindowBar', () => ({ ServiceWindowBar: () => null }))
vi.mock('./AgentActivity', () => ({ AgentActivity: () => null }))
vi.mock('./QuickRepliesPicker', () => ({ QuickRepliesPicker: () => null }))
vi.mock('./TemplatePickerModal', () => ({ TemplatePickerModal: () => null }))
vi.mock('./modals/CSATModal', () => ({ CSATModal: () => null }))
vi.mock('./modals/TransferModal', () => ({ TransferModal: () => null }))
vi.mock('./modals/PaymentLinkModal', () => ({ PaymentLinkModal: () => null }))

let root: Root
let host: HTMLDivElement
let pending: Map<string, (value: Response) => void>
let fetchMock: ReturnType<typeof vi.fn>
const props = {
  conversation: { id: 'conversation-1', is_bot_active: true, contact_name: 'Contato', phone_number: '5511999999999' } as any,
  messages: [], isLoading: false, isSending: false, showContactPanel: false,
  onSendMessage: vi.fn(), onSendMedia: vi.fn(), onToggleBot: vi.fn(),
  onBack: vi.fn(), onToggleContactPanel: vi.fn(),
}

async function render(organizationId?: string) {
  await act(async () => { root.render(<ChatPanel {...props} organizationId={organizationId} />) })
}
async function reply(org: string, name: string) {
  await act(async () => { pending.get(org)!({ ok: true, json: async () => ({ agents: [{ name }] }) } as Response) })
}
beforeEach(() => {
  ;(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true
  vi.stubGlobal('React', React)
  pending = new Map()
  fetchMock = vi.fn((url: string) => new Promise<Response>((resolve) => {
    pending.set(new URL(url, 'http://localhost').searchParams.get('organization_id')!, resolve)
  }))
  vi.stubGlobal('fetch', fetchMock)
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})
afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

it('refreshes the agent name and clears the old tenant when organization changes', async () => {
  await render('org-a')
  await reply('org-a', 'Equipe Alfa')
  expect(host.textContent).toContain('Equipe Alfa')
  await render('org-b')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(host.textContent).not.toContain('Equipe Alfa')
  await reply('org-b', 'Equipe Beta')
  expect(host.textContent).toContain('Equipe Beta')
  await render(undefined)
  expect(host.textContent).not.toContain('Equipe Beta')
})

it('does not display the old organization when its response arrives after the new one', async () => {
  await render('org-a')
  await render('org-b')
  expect(fetchMock).toHaveBeenCalledTimes(2)
  await reply('org-b', 'Equipe Beta')
  await reply('org-a', 'Equipe Alfa')
  expect(host.textContent).toContain('Equipe Beta')
  expect(host.textContent).not.toContain('Equipe Alfa')
})
