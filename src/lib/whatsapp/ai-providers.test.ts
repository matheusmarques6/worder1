import { describe, it, expect, vi, afterEach } from 'vitest';
import { callAI, callAIWithTools } from './ai-providers';

// item 27 do audit: a chave do Gemini (BYO key do lojista) ia na query string
// da URL. Cobre callAI (sem tools) e callAIWithTools (com tools) — são duas
// implementações copiadas, e cópia esquecida é o defeito voltando.

function geminiTextResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: 'oi' }] } }],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 3 },
    }),
  };
}

function geminiErrorResponse() {
  return {
    ok: false,
    status: 400,
    json: async () => ({ error: { message: 'chave invalida' } }),
  };
}

const config = { provider: 'gemini' as const, apiKey: 'segredo-do-lojista', model: 'gemini-1.5-flash' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('callAI/gemini — transporte da API key', () => {
  it('URL montada nao contem a chave (nem key=, nem qualquer outro param)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiTextResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callAI(config, [{ role: 'user', content: 'oi' }]);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('segredo-do-lojista');
    expect(url).not.toMatch(/[?&]key=/);
  });

  it('a chave vai no header x-goog-api-key com o valor certo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiTextResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callAI(config, [{ role: 'user', content: 'oi' }]);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('segredo-do-lojista');
  });

  it('resposta de sucesso continua interpretada como hoje', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiTextResponse()));

    const res = await callAI(config, [{ role: 'user', content: 'oi' }]);

    expect(res.content).toBe('oi');
    expect(res.usage).toEqual({ promptTokens: 1, completionTokens: 2, totalTokens: 3 });
  });

  it('caminho de erro do provedor continua igual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiErrorResponse()));

    await expect(callAI(config, [{ role: 'user', content: 'oi' }])).rejects.toThrow('chave invalida');
  });
});

describe('callAIWithTools/gemini — transporte da API key', () => {
  it('URL montada nao contem a chave', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiTextResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callAIWithTools(config, [{ role: 'user', content: 'oi' }], []);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).not.toContain('segredo-do-lojista');
    expect(url).not.toMatch(/[?&]key=/);
  });

  it('a chave vai no header x-goog-api-key com o valor certo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(geminiTextResponse());
    vi.stubGlobal('fetch', fetchMock);

    await callAIWithTools(config, [{ role: 'user', content: 'oi' }], []);

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['x-goog-api-key']).toBe('segredo-do-lojista');
  });

  it('caminho de erro do provedor continua igual', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(geminiErrorResponse()));

    await expect(
      callAIWithTools(config, [{ role: 'user', content: 'oi' }], []),
    ).rejects.toThrow('chave invalida');
  });
});
