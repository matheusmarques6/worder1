/**
 * Toda env que o motor de IA LÊ está declarada no `.env.example`?
 *
 * Trava que o item 62 atribuiu por escrito ao item 63
 * (`task-62-exec-review.md:369`), e o 63 é o último da fila — recusá-la aqui a
 * deixaria órfã. O recorte é a superfície de env do próprio motor
 * (`src/lib/ai/` + `src/app/api/ai/`), não a política geral do `.env.example`
 * da raiz: essa o item 62 devolveu ao dono do produto e este arquivo não a
 * reabre.
 *
 * O modo de falha que ela impede é o de sempre com arquivo de exemplo: alguém
 * acrescenta um `process.env.X` numa rota nova, o deploy sobe sem `X`, e o
 * caminho morre em produção com o valor `undefined` em vez de morrer no CI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../..');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');

const SCANNED_ROOTS = ['src/lib/ai', 'src/app/api/ai'];

/**
 * `NODE_ENV` é de plataforma: Next e Node a definem sozinhos, não é segredo, e
 * declará-la num `.env.example` convida o lojista a sobrescrevê-la. É o único
 * nome isento — `GEN_BUBBLE_VECTORS` e `ENCRYPTION_KEY` não precisam de
 * isenção porque só são lidas em `__tests__/`, e o filtro abaixo as tira antes.
 */
const PLATFORM_ENVS = new Set(['NODE_ENV']);

const sourceFiles = SCANNED_ROOTS.flatMap((root) =>
  readdirSync(path.join(ROOT, root), { recursive: true })
    .map((entry) => `${root}/${String(entry).split(path.sep).join('/')}`)
    .filter((file) => /\.tsx?$/.test(file) && !file.includes('__tests__')),
);

const READ_ENVS = new Set(
  sourceFiles.flatMap((file) => [...read(file).matchAll(/process\.env\.([A-Z_0-9]+)/g)].map((m) => m[1])),
);

// Só a declaração real conta: uma linha comentada no exemplo não é preenchida
// por ninguém no deploy.
const DECLARED_ENVS = new Set(
  [...read('.env.example').matchAll(/^\s*([A-Z_0-9]+)\s*=/gm)].map((m) => m[1]),
);

describe('envs do motor de IA × .env.example', () => {
  it('toda env lida em src/lib/ai e src/app/api/ai está declarada no .env.example', () => {
    const missing = [...READ_ENVS]
      .filter((name) => !PLATFORM_ENVS.has(name) && !DECLARED_ENVS.has(name))
      .sort();

    expect(missing, `envs lidas pelo motor e ausentes do .env.example: ${missing.join(', ')}`).toEqual([]);
  });

  it('a varredura achou alguma coisa e a isenção ainda corresponde a uma env viva (guarda anti-vacuidade)', () => {
    // Molde de `test_the_guard_has_someone_to_guard`
    // (`runtime/tests/unit/test_resolved_names_do_not_collide.py:99-101`): uma
    // trava que parametriza sobre varredura tem de provar que varreu alguma
    // coisa. Sem isto, o caso acima passa vazio no dia em que o recorte mudar
    // de lugar, e a isenção apodrece viva.
    expect(sourceFiles.length).toBeGreaterThan(0);
    expect(READ_ENVS.size).toBeGreaterThan(0);
    expect(DECLARED_ENVS.size).toBeGreaterThan(0);
    for (const exempt of PLATFORM_ENVS) {
      expect(READ_ENVS, `${exempt} está isenta mas ninguém a lê mais`).toContain(exempt);
    }
  });
});
