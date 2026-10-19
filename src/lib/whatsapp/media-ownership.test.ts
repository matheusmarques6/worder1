import { beforeEach, expect, it, vi } from 'vitest'
import { ownedMediaPath, resolveOwnedMediaPath } from './media-ownership'
beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co'))
it.each([
  'org/conv/%2e%2e/x.jpg', 'org/conv/a%2fb.jpg', 'org/conv/a\\b.jpg',
  'org/conv//x.jpg', 'org/conv/../x.jpg', 'org/conv/x.jpg/extra', 'org/conv/.hidden',
])('rejects ambiguous key %s', path => expect(ownedMediaPath(path, 'org', 'conv')).toBeNull())
it.each([
  'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org/conv/../conv/a.jpg',
  'https://project.supabase.co/storage/v1/object/public/whatsapp-media/org/conv/a%2fb.jpg',
  'https://user@project.supabase.co/storage/v1/object/public/whatsapp-media/org/conv/a.jpg',
  'https://project.supabase.co/storage/v1/object/public/other-bucket/org/conv/a.jpg',
])('rejects unsafe legacy URL %s', media_url => expect(resolveOwnedMediaPath({ media_url }, 'org', 'conv')).toBeNull())
it('extracts an owned signed URL without retaining its expired token', () => {
  expect(resolveOwnedMediaPath({ media_url: 'https://project.supabase.co/storage/v1/object/sign/whatsapp-media/org/conv/a.jpg?token=expired%2Ftoken' }, 'org', 'conv')).toBe('org/conv/a.jpg')
})
