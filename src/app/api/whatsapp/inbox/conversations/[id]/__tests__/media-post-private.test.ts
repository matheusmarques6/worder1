import { beforeEach, expect, it, vi } from 'vitest'
const state = vi.hoisted(() => ({
  conversation: {} as any, saved: {} as any, upload: vi.fn(), sign: vi.fn(), publicUrl: vi.fn(),
  metaUpload: vi.fn(), send: vi.fn(), token: vi.fn(),
}))
vi.mock('@/lib/auth/require-org', () => ({ requireOrgFromAuth: async () => ({ orgId: 'org-1', userId: 'u-1' }) }))
vi.mock('@/lib/whatsapp/account-loader', () => ({ getAccessToken: state.token }))
vi.mock('@/lib/whatsapp/cloud-api', () => ({ createWhatsAppCloudClient: () => ({ uploadMedia: state.metaUpload, sendImage: state.send }) }))
vi.mock('@/lib/whatsapp/opt-out-guard', () => ({ requireOptIn: async () => ({ allowed: true }), readOverrideFromRequest: () => null }))
vi.mock('@/lib/whatsapp/send-guard', () => ({ checkBeforeSend: async () => ({ allowed: true }), reportSendResult: async () => {} }))
vi.mock('@/lib/supabase-admin', () => ({ supabaseAdmin: {
  from: (table: string) => {
    const query: any = new Proxy({}, { get: (_, key) => {
      if (key === 'then') return (resolve: any) => Promise.resolve({ data: table === 'whatsapp_cloud_conversations' ? state.conversation : state.saved }).then(resolve)
      return (...args: any[]) => { if (key === 'upsert') state.saved = args[0]; return query }
    } })
    return query
  },
  storage: { from: () => ({ upload: state.upload, createSignedUrl: state.sign, getPublicUrl: state.publicUrl }) },
} }))
import { POST } from '../media/route'
const send = () => {
  const form = new FormData()
  form.set('file', new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' }))
  form.set('mediaType', 'image')
  return POST({ formData: async () => form } as any, { params: Promise.resolve({ id: 'conv-1' }) })
}
beforeEach(() => {
  vi.clearAllMocks()
  state.conversation = { organization_id: 'org-1', waba_id: 'acc-1', contact_phone: '5511999', account: { id: 'acc-1', organization_id: 'org-1', phone_number_id: 'phone-1' } }
  state.saved = {}
  state.upload.mockResolvedValue({ error: null })
  state.sign.mockResolvedValue({ data: { signedUrl: 'signed:media' } })
  state.metaUpload.mockResolvedValue({ id: 'meta-media-1' })
  state.send.mockResolvedValue({ messages: [{ id: 'wamid.1' }] })
})
it('sends bytes to Meta and dispatches by media_id while storing an owned private key', async () => {
  expect((await send()).status).toBe(200)
  expect(state.metaUpload).toHaveBeenCalledWith(expect.any(ArrayBuffer), 'image/jpeg', 'photo.jpg')
  expect(state.send).toHaveBeenCalledWith('5511999', { id: 'meta-media-1' }, undefined)
  expect(state.saved.media_storage_path).toMatch(/^org-1\/conv-1\/[^/]+\.jpg$/)
  expect(state.saved.media_url).toBe('signed:media')
})
it('keeps Meta send and private retry key on signing failure without public fallback', async () => {
  state.sign.mockResolvedValue({ data: null, error: { message: 'sign failed' } })
  expect((await send()).status).toBe(200)
  expect(state.send).toHaveBeenCalled()
  expect(state.saved.media_url).toBeNull()
  expect(state.saved.media_storage_path).toMatch(/^org-1\/conv-1\//)
  expect(state.publicUrl).not.toHaveBeenCalled()
})
it('rejects a conversation linked to another tenant account before token or writes', async () => {
  state.conversation.account.organization_id = 'org-2'
  expect((await send()).status).toBe(404)
  expect(state.token).not.toHaveBeenCalled()
  expect(state.upload).not.toHaveBeenCalled()
  expect(state.metaUpload).not.toHaveBeenCalled()
})
