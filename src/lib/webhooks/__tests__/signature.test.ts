import { describe, it, expect } from 'vitest';
import { signPayload, verifySignatureHeader, buildSignatureHeader } from '../signature';

const SECRET = 'test_secret_key';
const TIMESTAMP = '1745086425';
const BODY = '{"event":"order.created"}';

describe('signPayload', () => {
  it('gera HMAC SHA-256 hex de timestamp + . + body', () => {
    const sig = signPayload(SECRET, TIMESTAMP, BODY);
    expect(sig).toMatch(/^[a-f0-9]{64}$/);
    expect(sig).toBe(signPayload(SECRET, TIMESTAMP, BODY));
  });

  it('produz assinaturas diferentes pra body diferente', () => {
    expect(signPayload(SECRET, TIMESTAMP, BODY))
      .not.toBe(signPayload(SECRET, TIMESTAMP, BODY + 'x'));
  });
});

describe('buildSignatureHeader', () => {
  it('header com 1 secret tem só uma assinatura', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(h.split(',').length).toBe(1);
    expect(h).toMatch(/^sha256=[a-f0-9]{64}$/);
  });

  it('header com secret + previous tem duas assinaturas separadas por vírgula', () => {
    const h = buildSignatureHeader(SECRET, 'old_secret', TIMESTAMP, BODY);
    const parts = h.split(',').map((s) => s.trim());
    expect(parts.length).toBe(2);
    expect(parts[0]).toMatch(/^sha256=/);
    expect(parts[1]).toMatch(/^sha256=/);
    expect(parts[0]).not.toBe(parts[1]);
  });
});

describe('verifySignatureHeader', () => {
  it('aceita assinatura válida', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, SECRET, TIMESTAMP, BODY)).toBe(true);
  });

  it('rejeita assinatura inválida', () => {
    expect(verifySignatureHeader('sha256=ffff', SECRET, TIMESTAMP, BODY)).toBe(false);
  });

  it('rejeita body adulterado', () => {
    const h = buildSignatureHeader(SECRET, null, TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, SECRET, TIMESTAMP, BODY + 'tampered')).toBe(false);
  });

  it('aceita match em qualquer assinatura do header dual', () => {
    const h = buildSignatureHeader('new', 'old', TIMESTAMP, BODY);
    expect(verifySignatureHeader(h, 'old', TIMESTAMP, BODY)).toBe(true);
    expect(verifySignatureHeader(h, 'new', TIMESTAMP, BODY)).toBe(true);
  });

  it('comparação é tempo-constante (smoke test apenas)', () => {
    expect(verifySignatureHeader('sha256=00', SECRET, TIMESTAMP, BODY)).toBe(false);
  });
});
