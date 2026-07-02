import { describe, it, expect } from 'vitest'
import crypto from 'crypto'
import {
  normalizeEmail,
  normalizePhone,
  escapeIlikeWildcards,
  sanitizeDomain,
  answerValueToString,
  validateSubmitPayloadCaps,
  capiHashEmail,
  capiHashPhone,
  capiHashName,
  buildCapiUserData,
  isVisualPopupForm,
  MAX_ANSWER_KEYS,
} from '../submit-utils'

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest('hex')

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  Maria.Silva@GMAIL.com ')).toBe('maria.silva@gmail.com')
  })
  it('returns null for empty / nullish', () => {
    expect(normalizeEmail('')).toBeNull()
    expect(normalizeEmail('   ')).toBeNull()
    expect(normalizeEmail(null)).toBeNull()
    expect(normalizeEmail(undefined)).toBeNull()
  })
  it('rejects non-strings (progressive-profiling boolean markers)', () => {
    expect(normalizeEmail(true)).toBeNull()
    expect(normalizeEmail(123)).toBeNull()
  })
})

describe('normalizePhone', () => {
  it('keeps leading + and strips formatting', () => {
    expect(normalizePhone('+55 (11) 99999-9999')).toBe('+5511999999999')
  })
  it('strips formatting without inventing a country code', () => {
    expect(normalizePhone('(11) 9.9999-9999')).toBe('11999999999')
  })
  it('drops a + that is not leading', () => {
    expect(normalizePhone('11 9+9999')).toBe('1199999')
  })
  it('returns null when no digits', () => {
    expect(normalizePhone('abc')).toBeNull()
    expect(normalizePhone('')).toBeNull()
    expect(normalizePhone(null)).toBeNull()
  })
  it('accepts bare numbers but rejects booleans', () => {
    expect(normalizePhone(5511999999999)).toBe('5511999999999')
    expect(normalizePhone(true)).toBeNull()
  })
})

describe('escapeIlikeWildcards', () => {
  it('escapes %, _ and backslash', () => {
    expect(escapeIlikeWildcards('%@gmail.com')).toBe('\\%@gmail.com')
    expect(escapeIlikeWildcards('a_b')).toBe('a\\_b')
    expect(escapeIlikeWildcards('a\\b')).toBe('a\\\\b')
  })
  it('leaves normal emails untouched', () => {
    expect(escapeIlikeWildcards('maria@gmail.com')).toBe('maria@gmail.com')
  })
})

describe('sanitizeDomain', () => {
  it('lowercases and strips scheme/path', () => {
    expect(sanitizeDomain('https://Loja.MyShopify.com/pages/x')).toBe('loja.myshopify.com')
  })
  it('removes PostgREST filter injection characters', () => {
    expect(sanitizeDomain('x,id.not.is.null')).toBe('xid.not.is.null')
    expect(sanitizeDomain('a%b_c(d)e')).toBe('abcde')
  })
  it('returns empty string for nullish input', () => {
    expect(sanitizeDomain(null)).toBe('')
    expect(sanitizeDomain(undefined)).toBe('')
  })
})

describe('validateSubmitPayloadCaps', () => {
  it('accepts a normal payload', () => {
    expect(validateSubmitPayloadCaps({ email: 'a@b.c', first_name: 'Ana' }, { utm_source: 'fb' })).toBeNull()
  })
  it('rejects more than 50 answer keys', () => {
    const answers: Record<string, string> = {}
    for (let i = 0; i <= MAX_ANSWER_KEYS; i++) answers[`k${i}`] = 'v'
    expect(validateSubmitPayloadCaps(answers)).toMatch(/máximo/)
  })
  it('rejects a value longer than 1000 chars', () => {
    expect(validateSubmitPayloadCaps({ note: 'x'.repeat(1001) })).toMatch(/1000/)
  })
  it('measures arrays by their joined length', () => {
    expect(validateSubmitPayloadCaps({ opts: ['x'.repeat(600), 'y'.repeat(600)] })).toMatch(/1000/)
    expect(validateSubmitPayloadCaps({ opts: ['a', 'b'] })).toBeNull()
  })
  it('rejects a UTM longer than 500 chars', () => {
    expect(validateSubmitPayloadCaps({ email: 'a@b.c' }, { utm_campaign: 'x'.repeat(501) })).toMatch(/500/)
  })
})

describe('answerValueToString', () => {
  it('joins arrays with commas', () => {
    expect(answerValueToString(['A', 'B'])).toBe('A,B')
  })
  it('stringifies scalars and empties', () => {
    expect(answerValueToString(12)).toBe('12')
    expect(answerValueToString(null)).toBe('')
  })
})

describe('CAPI hashing (Meta spec)', () => {
  it('hashes email lowercased + trimmed', () => {
    expect(capiHashEmail(' Ana@Gmail.com ')).toBe(sha256('ana@gmail.com'))
  })
  it('hashes phone digits-only (no plus, no formatting)', () => {
    expect(capiHashPhone('+55 (11) 99999-9999')).toBe(sha256('5511999999999'))
  })
  it('hashes names lowercased', () => {
    expect(capiHashName(' Ana ')).toBe(sha256('ana'))
  })
  it('returns null for missing values', () => {
    expect(capiHashEmail(null)).toBeNull()
    expect(capiHashPhone('')).toBeNull()
    expect(capiHashName(undefined)).toBeNull()
  })
  it('buildCapiUserData never emits plaintext PII', () => {
    const ud = buildCapiUserData(
      { email: 'Ana@Gmail.com', phone: '+55 11 99999-9999', first_name: 'Ana', last_name: 'Silva' },
      { ip: '1.2.3.4', userAgent: 'UA' }
    )
    expect(ud.em).toEqual([sha256('ana@gmail.com')])
    expect(ud.ph).toEqual([sha256('5511999999999')])
    expect(ud.fn).toEqual([sha256('ana')])
    expect(ud.ln).toEqual([sha256('silva')])
    const serialized = JSON.stringify(ud)
    expect(serialized).not.toContain('Ana')
    expect(serialized).not.toContain('gmail.com')
    expect(serialized).not.toContain('99999')
  })
  it('omits fields it cannot hash', () => {
    const ud = buildCapiUserData({ email: 'a@b.c' }, { ip: null, userAgent: null })
    expect(ud.ph).toBeUndefined()
    expect(ud.fn).toBeUndefined()
    expect(ud.ln).toBeUndefined()
  })
})

describe('isVisualPopupForm', () => {
  it('detects visual form types regardless of design', () => {
    expect(isVisualPopupForm('popup', {})).toBe(true)
    expect(isVisualPopupForm('flyout', null)).toBe(true)
    expect(isVisualPopupForm('banner', undefined)).toBe(true)
    expect(isVisualPopupForm('fullpage', {})).toBe(true)
  })
  it('detects a visual design on an embed form', () => {
    expect(isVisualPopupForm('embed', { steps: [{ blocks: [] }] })).toBe(true)
  })
  it('treats classic embed forms as non-visual', () => {
    expect(isVisualPopupForm('embed', {})).toBe(false)
    expect(isVisualPopupForm(null, { steps: [] })).toBe(false)
    expect(isVisualPopupForm(undefined, undefined)).toBe(false)
  })
})
