import { describe, it, expect } from 'vitest'
import {
  mapCloudMessageRow,
  mapCloudConversationRow,
} from './inbox-realtime-mappers'

describe('mapCloudMessageRow', () => {
  it('mapeia linha de texto para o mesmo shape do GET /messages', () => {
    const row = {
      id: 'msg-1',
      conversation_id: 'conv-1',
      message_id: 'wamid.ABC',
      direction: 'inbound',
      message_type: 'text',
      content: { text: { body: 'oi' } },
      text_body: 'oi',
      status: 'delivered',
      sent_by_bot: false,
      timestamp: '2026-07-27T12:00:00Z',
      created_at: '2026-07-27T12:00:01Z',
    }
    expect(mapCloudMessageRow(row)).toEqual({
      id: 'msg-1',
      conversation_id: 'conv-1',
      meta_message_id: 'wamid.ABC',
      direction: 'inbound',
      message_type: 'text',
      content: 'oi',
      media_url: null,
      media_filename: null,
      media_mime_type: null,
      media_storage_path: null,
      status: 'delivered',
      sent_by_bot: false,
      is_deleted: false,
      created_at: '2026-07-27T12:00:01Z',
      delivered_at: null,
      read_at: null,
      error_code: undefined,
      error_message: undefined,
    })
  })

  it('aplica os mesmos defaults do GET: status sent, created_at cai pro timestamp, caption de midia', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-2',
      conversation_id: 'conv-1',
      message_id: 'wamid.DEF',
      direction: 'outbound',
      message_type: 'image',
      content: { image: { id: 'media-1', caption: 'foto' } },
      text_body: null,
      status: null,
      sent_by_bot: null,
      created_at: null,
      timestamp: '2026-07-27T13:00:00Z',
      media_url: 'https://signed.example/media-1.jpg',
      media_filename: 'foto.jpg',
      media_mime_type: 'image/jpeg',
      media_storage_path: 'org-1/media-1.jpg',
    })
    expect(msg.status).toBe('sent')
    expect(msg.created_at).toBe('2026-07-27T13:00:00Z')
    expect(msg.content).toBe('foto')
    expect(msg.sent_by_bot).toBe(false)
    expect(msg.media_url).toBe('https://signed.example/media-1.jpg')
    expect(msg.media_filename).toBe('foto.jpg')
    expect(msg.media_mime_type).toBe('image/jpeg')
    expect((msg as any).media_storage_path).toBe('org-1/media-1.jpg')
  })

  it('midia ausente vira null (nao quebra bolha, so nao renderiza midia)', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-2b',
      conversation_id: 'conv-1',
      message_id: 'wamid.DEF2',
      direction: 'inbound',
      message_type: 'text',
      content: { text: { body: 'sem midia' } },
      timestamp: '2026-07-27T13:00:00Z',
    })
    expect(msg.media_url).toBeNull()
    expect(msg.media_filename).toBeNull()
    expect(msg.media_mime_type).toBeNull()
    expect((msg as any).media_storage_path).toBeNull()
  })

  it('propaga delivered_at/read_at de atualizacoes de status (recibos de entrega)', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-4',
      conversation_id: 'conv-1',
      message_id: 'wamid.JKL',
      direction: 'outbound',
      message_type: 'text',
      content: { text: { body: 'oi' } },
      status: 'read',
      timestamp: '2026-07-27T15:00:00Z',
      delivered_at: '2026-07-27T15:00:05Z',
      read_at: '2026-07-27T15:00:10Z',
    })
    expect(msg.delivered_at).toBe('2026-07-27T15:00:05Z')
    expect(msg.read_at).toBe('2026-07-27T15:00:10Z')
  })

  it('propaga erro de envio (status failed + error_code/error_message)', () => {
    const msg = mapCloudMessageRow({
      id: 'msg-3',
      conversation_id: 'conv-1',
      message_id: 'wamid.GHI',
      direction: 'outbound',
      message_type: 'text',
      content: { text: { body: 'x' } },
      status: 'failed',
      error_code: '131047',
      error_message: 'Re-engagement message',
      timestamp: '2026-07-27T14:00:00Z',
    })
    expect(msg.status).toBe('failed')
    expect(msg.error_code).toBe('131047')
    expect(msg.error_message).toBe('Re-engagement message')
  })
})

describe('mapCloudConversationRow', () => {
  it('mapeia os campos que os callbacks do InboxContent usam', () => {
    const conv = mapCloudConversationRow({
      id: 'conv-1',
      organization_id: 'org-1',
      store_id: 'store-1',
      contact_id: 'ct-1',
      contact_name: 'Maria',
      contact_phone: '+5511999999999',
      wa_id: '5511999999999',
      status: 'open',
      unread_count: 2,
      last_message_at: '2026-07-27T12:00:00Z',
      last_message_preview: 'oi',
      last_message_direction: 'inbound',
    })
    expect(conv.id).toBe('conv-1')
    expect(conv.store_id).toBe('store-1')
    expect(conv.phone_number).toBe('+5511999999999')
    expect(conv.contact_name).toBe('Maria')
    expect(conv.unread_count).toBe(2)
    expect(conv.last_message_direction).toBe('inbound')
  })

  it('store_id ausente vira null (conversa "org" — visivel em toda loja, padrao store-or-org da API)', () => {
    const conv = mapCloudConversationRow({ id: 'conv-2', organization_id: 'org-1' })
    expect(conv.store_id).toBeNull()
    expect(conv.status).toBe('open')
    expect(conv.unread_count).toBe(0)
  })

  it('phone_number cai para wa_id quando contact_phone falta', () => {
    const conv = mapCloudConversationRow({
      id: 'conv-3',
      organization_id: 'org-1',
      wa_id: '5511888888888',
    })
    expect(conv.phone_number).toBe('5511888888888')
    expect(conv.contact_name).toBe('5511888888888')
  })
})
