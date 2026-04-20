import { describe, it, expect } from 'vitest';
import { byteaToBuffer } from '../bytea';

describe('byteaToBuffer', () => {
  const source = Buffer.from('hello world', 'utf8');

  it('aceita Buffer direto', () => {
    expect(byteaToBuffer(source)).toEqual(source);
  });

  it('aceita hex com prefix "\\\\x"', () => {
    const hex = '\\x' + source.toString('hex');
    expect(byteaToBuffer(hex)).toEqual(source);
  });

  it('aceita hex puro', () => {
    expect(byteaToBuffer(source.toString('hex'))).toEqual(source);
  });

  it('aceita base64', () => {
    expect(byteaToBuffer(source.toString('base64'))).toEqual(source);
  });

  it('aceita { type: "Buffer", data: [...] }', () => {
    const serialized = { type: 'Buffer', data: Array.from(source) };
    expect(byteaToBuffer(serialized)).toEqual(source);
  });

  it('lança pra input desconhecido', () => {
    expect(() => byteaToBuffer(42 as any)).toThrow();
    expect(() => byteaToBuffer(null as any)).toThrow();
  });
});
