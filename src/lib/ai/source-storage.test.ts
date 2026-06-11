import { describe, it, expect } from 'vitest'
import { extractStoragePathFromFileUrl, AI_SOURCES_BUCKET } from './source-storage'

describe('extractStoragePathFromFileUrl', () => {
  it('extrai o path de uma URL pública do Supabase', () => {
    const url = 'https://xyz.supabase.co/storage/v1/object/public/ai-sources/org-1/agent-1/123_doc.pdf'
    expect(extractStoragePathFromFileUrl(url)).toBe('org-1/agent-1/123_doc.pdf')
  })

  it('retorna null para null/undefined/vazio', () => {
    expect(extractStoragePathFromFileUrl(null)).toBeNull()
    expect(extractStoragePathFromFileUrl(undefined)).toBeNull()
    expect(extractStoragePathFromFileUrl('')).toBeNull()
  })

  it('retorna null quando a URL não contém o bucket', () => {
    expect(extractStoragePathFromFileUrl('https://exemplo.com/outro/arquivo.pdf')).toBeNull()
  })

  it('expõe o nome do bucket como constante', () => {
    expect(AI_SOURCES_BUCKET).toBe('ai-sources')
  })
})
