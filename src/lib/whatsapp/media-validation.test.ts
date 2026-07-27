import { describe, it, expect } from 'vitest'
import { validateWhatsAppMediaFile } from './media-validation'

describe('validateWhatsAppMediaFile', () => {
  it('aceita jpeg dentro do limite de imagem (5MB)', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.jpg', size: 4 * 1024 * 1024, type: 'image/jpeg' }, 'image')
    expect(r.valid).toBe(true)
  })
  it('rejeita imagem acima de 5MB', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.jpg', size: 6 * 1024 * 1024, type: 'image/jpeg' }, 'image')
    expect(r.valid).toBe(false)
    expect(r.error).toContain('5MB')
  })
  it('rejeita extensao perigosa', () => {
    const r = validateWhatsAppMediaFile({ name: 'x.exe', size: 100, type: 'application/pdf' }, 'document')
    expect(r.valid).toBe(false)
  })
  it('rejeita MIME fora da lista da Meta', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.gif', size: 100, type: 'image/gif' }, 'image')
    expect(r.valid).toBe(false)
  })
  it('aceita pdf como document', () => {
    const r = validateWhatsAppMediaFile({ name: 'a.pdf', size: 100, type: 'application/pdf' }, 'document')
    expect(r.valid).toBe(true)
  })
})
