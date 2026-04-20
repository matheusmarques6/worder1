/**
 * Normaliza bytea retornado pelo supabase-js. Dependendo do driver e da
 * configuração do PostgREST, bytea pode voltar como:
 *   - string "\\xAABB..." (hex com prefix)
 *   - string hex puro
 *   - string base64
 *   - Buffer já decodificado
 *   - { type: 'Buffer', data: [...] }
 */
export function byteaToBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value === 'string') {
    if (value.startsWith('\\x')) return Buffer.from(value.slice(2), 'hex');
    if (/^[0-9a-fA-F]+$/.test(value) && value.length % 2 === 0) {
      return Buffer.from(value, 'hex');
    }
    return Buffer.from(value, 'base64');
  }
  if (value && typeof value === 'object' && 'data' in (value as any)) {
    return Buffer.from((value as any).data);
  }
  throw new Error('Unknown bytea encoding');
}
