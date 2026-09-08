// =============================================================
// Upload em lote: nada some em silêncio.
//
// A biblioteca subia um arquivo por vez e engolia erro. Aqui travamos:
// validação antes da rede com o motivo exato, concorrência limitada,
// ordem preservada, e o resultado separando o que subiu do que falhou.
// =============================================================

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateMediaFile, uploadMediaFiles, deleteMediaFiles, summarizeUpload,
} from '../upload';

function arquivo(name: string, type = 'image/png', size = 1024): File {
  const f = new File([new Uint8Array(1)], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  return f;
}

describe('validateMediaFile', () => {
  it('aceita os tipos permitidos', () => {
    for (const t of ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml']) {
      expect(validateMediaFile(arquivo('a', t))).toBeNull();
    }
  });

  it('recusa tipo estranho com motivo legível', () => {
    expect(validateMediaFile(arquivo('doc.pdf', 'application/pdf'))).toMatch(/Tipo não permitido/);
  });

  it('recusa acima de 10 MB e diz o tamanho', () => {
    const m = validateMediaFile(arquivo('big.png', 'image/png', 12 * 1024 * 1024));
    expect(m).toMatch(/12\.0 MB/);
    expect(m).toMatch(/10 MB/);
  });
});

describe('uploadMediaFiles', () => {
  let chamadas: string[];
  let emVoo: number;
  let picoEmVoo: number;

  beforeEach(() => {
    chamadas = [];
    emVoo = 0;
    picoEmVoo = 0;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: any) => {
      const f = (init.body as FormData).get('file') as File;
      chamadas.push(f.name);
      emVoo++;
      picoEmVoo = Math.max(picoEmVoo, emVoo);
      // Tempos diferentes para embaralhar a ordem de resposta
      await new Promise((r) => setTimeout(r, f.name.includes('lento') ? 30 : 5));
      emVoo--;
      if (f.name.includes('falha')) {
        return { ok: false, status: 500, json: async () => ({ error: 'Storage indisponível' }) };
      }
      return {
        ok: true, status: 201,
        json: async () => ({ id: `id-${f.name}`, name: f.name, url: `https://cdn/${f.name}`, size: 1, type: f.type, created_at: 'x', storage_path: `org/${f.name}` }),
      };
    }));
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('sobe vários e preserva a ordem de escolha, mesmo com respostas fora de ordem', async () => {
    const r = await uploadMediaFiles([arquivo('a-lento.png'), arquivo('b.png'), arquivo('c.png')]);
    expect(r.uploaded.map((f) => f.name)).toEqual(['a-lento.png', 'b.png', 'c.png']);
    expect(r.failed).toEqual([]);
  });

  it('limita a três em voo', async () => {
    await uploadMediaFiles(Array.from({ length: 8 }, (_, i) => arquivo(`f${i}-lento.png`)));
    expect(picoEmVoo).toBeLessThanOrEqual(3);
    expect(chamadas).toHaveLength(8);
  });

  it('inválido não vai à rede e aparece em failed com o motivo', async () => {
    const r = await uploadMediaFiles([arquivo('ok.png'), arquivo('x.pdf', 'application/pdf')]);
    expect(chamadas).toEqual(['ok.png']);
    expect(r.failed).toEqual([{ name: 'x.pdf', reason: expect.stringMatching(/Tipo não permitido/) }]);
  });

  it('falha do servidor vira failed com a mensagem da API, sem derrubar o resto', async () => {
    const r = await uploadMediaFiles([arquivo('a.png'), arquivo('b-falha.png'), arquivo('c.png')]);
    expect(r.uploaded.map((f) => f.name)).toEqual(['a.png', 'c.png']);
    expect(r.failed).toEqual([{ name: 'b-falha.png', reason: 'Storage indisponível' }]);
  });

  it('reporta progresso até o total, contando os recusados', async () => {
    const passos: number[] = [];
    await uploadMediaFiles([arquivo('a.png'), arquivo('x.pdf', 'application/pdf')], null, (done) => passos.push(done));
    expect(passos[0]).toBe(1);            // o recusado já conta
    expect(passos[passos.length - 1]).toBe(2);
  });

  it('lista vazia devolve vazio sem chamar nada', async () => {
    const r = await uploadMediaFiles([]);
    expect(r).toEqual({ uploaded: [], failed: [] });
    expect(chamadas).toEqual([]);
  });
});

describe('deleteMediaFiles', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('manda a lista e devolve o que a API confirmou', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: any) => {
      const body = JSON.parse(init.body);
      expect(body.storage_paths).toEqual(['org/a', 'org/b']);
      return { ok: true, json: async () => ({ deleted: ['org/a'], failed: ['org/b'] }) };
    }));
    const r = await deleteMediaFiles(['org/a', 'org/b']);
    expect(r).toEqual({ deleted: ['org/a'], failed: ['org/b'] });
  });

  it('erro HTTP marca tudo como falho — nada some da tela por engano', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({ error: 'x' }) })));
    const r = await deleteMediaFiles(['org/a']);
    expect(r).toEqual({ deleted: [], failed: ['org/a'] });
  });

  it('lista vazia não chama a API', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await deleteMediaFiles([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('summarizeUpload', () => {
  it('conjuga certo', () => {
    expect(summarizeUpload({ uploaded: [{} as any], failed: [] })).toBe('1 enviada');
    expect(summarizeUpload({ uploaded: [{} as any, {} as any], failed: [{ name: 'x', reason: 'y' }] })).toBe('2 enviadas · 1 falhou');
    expect(summarizeUpload({ uploaded: [], failed: [{ name: 'x', reason: 'y' }, { name: 'z', reason: 'w' }] })).toBe('2 falharam');
  });
});
