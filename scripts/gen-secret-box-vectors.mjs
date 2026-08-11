#!/usr/bin/env node
/**
 * Gera os vetores cross-language do secret-box para o port Python do runtime
 * (runtime/tests/unit/fixtures/secret_box_vectors.json).
 *
 * Espelha src/lib/crypto/secret-box.ts CHAMADA A CHAMADA (mesmos primitivos do
 * node:crypto — scrypt defaults N=16384/r=8/p=1, AES-256-GCM, hex): qualquer
 * divergência do TS canônico é bug AQUI e quebra o teste Python de roundtrip
 * contra os vetores. Salts/IVs fixos de propósito — vetor é fixture, não sorteio.
 *
 * Rodar: node scripts/gen-secret-box-vectors.mjs
 */
import { createCipheriv, scryptSync } from 'crypto'
import { writeFileSync } from 'fs'

const KEY = 'vector-fixture-key-0123456789abcdef' // >=32 chars, SÓ para fixtures
const LEGACY_SALT = 'salt'

function deriveKey(salt) {
  return scryptSync(KEY, salt, 32)
}

function encryptV2(plain, saltHex, ivHex) {
  const salt = Buffer.from(saltHex, 'hex')
  const iv = Buffer.from(ivHex, 'hex')
  const cipher = createCipheriv('aes-256-gcm', deriveKey(salt), iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `v2:${saltHex}:${ivHex}:${cipher.getAuthTag().toString('hex')}:${encrypted}`
}

function encryptLegacy(plain, ivHex) {
  const iv = Buffer.from(ivHex, 'hex')
  const cipher = createCipheriv('aes-256-gcm', deriveKey(LEGACY_SALT), iv)
  let encrypted = cipher.update(plain, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  return `${ivHex}:${cipher.getAuthTag().toString('hex')}:${encrypted}`
}

const vectors = [
  {
    name: 'v2_ascii',
    format: 'v2',
    plain: 'sk-ant-api03-um-segredo-de-verdade',
    stored: encryptV2(
      'sk-ant-api03-um-segredo-de-verdade',
      '000102030405060708090a0b0c0d0e0f',
      '101112131415161718191a1b1c1d1e1f',
    ),
  },
  {
    name: 'v2_utf8',
    format: 'v2',
    plain: 'chave com acentuação e emoji 🧡',
    stored: encryptV2(
      'chave com acentuação e emoji 🧡',
      'ffeeddccbbaa99887766554433221100',
      '0f0e0d0c0b0a09080706050403020100',
    ),
  },
  {
    name: 'v2_long',
    format: 'v2',
    plain: 'EAAG'.repeat(64),
    stored: encryptV2(
      'EAAG'.repeat(64),
      'a1a2a3a4a5a6a7a8a9aaabacadaeafb0',
      'b1b2b3b4b5b6b7b8b9babbbcbdbebfc0',
    ),
  },
  {
    name: 'legacy_3_parts',
    format: 'legacy',
    plain: 'token-legado-gravado-antes-do-v2',
    stored: encryptLegacy(
      'token-legado-gravado-antes-do-v2',
      '202122232425262728292a2b2c2d2e2f',
    ),
  },
]

const out = {
  note:
    'Gerado por scripts/gen-secret-box-vectors.mjs (Node ' +
    process.version +
    ') espelhando src/lib/crypto/secret-box.ts. NÃO editar à mão; regenerar.',
  encryption_key: KEY,
  legacy_salt: LEGACY_SALT,
  scrypt: { n: 16384, r: 8, p: 1, dklen: 32 },
  vectors,
}

writeFileSync(
  new URL('../runtime/tests/unit/fixtures/secret_box_vectors.json', import.meta.url),
  JSON.stringify(out, null, 2) + '\n',
)
console.log(`ok: ${vectors.length} vetores`)
