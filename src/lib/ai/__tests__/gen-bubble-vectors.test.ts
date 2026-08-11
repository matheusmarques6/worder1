// Gerador dos vetores de paridade do split de bolhas (Adendo §B, 8.3).
//
// A humanização do runtime Python PORTA o splitIntoBubbles deste repo; a
// paridade não se declara, se PROVA — este arquivo roda o algoritmo TS real
// sobre casos representativos e escreve o fixture que a suíte Python compara
// byte a byte (o mesmo desenho dos vetores do secret-box).
//
// Só roda com GEN_BUBBLE_VECTORS=1 (gera e commita o JSON; o CI normal pula):
//   GEN_BUBBLE_VECTORS=1 pnpm vitest run src/lib/ai/__tests__/gen-bubble-vectors.test.ts

import { describe, it, expect } from 'vitest';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { splitIntoBubbles } from '../cloud-sender';

const CASES: { name: string; text: string }[] = [
  { name: 'uma bolha curta', text: 'Oi! Tudo bem? Seu pedido saiu hoje. 🧡' },
  { name: 'dois parágrafos', text: 'Oi Joana!\n\nSeu carrinho ainda está aqui.' },
  {
    name: 'três ou mais quebras contam como uma',
    text: 'Primeira parte.\n\n\n\nSegunda parte.',
  },
  {
    name: 'quebra simples NÃO separa',
    text: 'Linha um\nlinha dois do MESMO parágrafo.',
  },
  {
    name: 'parágrafo longo quebra em fronteira de espaço',
    text: ('A promoção vale para todos os itens da loja e o frete é grátis acima de noventa e nove reais. '.repeat(12)).trim(),
  },
  {
    name: 'sem espaço útil força corte duro',
    text: 'aaaaaaaaaa ' + 'b'.repeat(800),
  },
  {
    name: 'corrida longa sem nenhum espaço',
    text: 'x'.repeat(1300),
  },
  {
    name: 'seis parágrafos viram quatro bolhas com cauda',
    text: ['Um.', 'Dois.', 'Três.', 'Quatro.', 'Cinco.', 'Seis.'].join('\n\n'),
  },
  {
    name: 'espaços nas bordas somem',
    text: '   Oi!   \n\n   Tchau!   ',
  },
  { name: 'vazio', text: '   ' },
];

describe.skipIf(!process.env.GEN_BUBBLE_VECTORS)('gerar vetores de bolhas', () => {
  it('escreve o fixture que o Python compara', () => {
    const vectors = CASES.map(({ name, text }) => ({
      name,
      text,
      bubbles: splitIntoBubbles(text),
    }));
    const out = resolve(
      __dirname,
      '../../../../runtime/tests/unit/fixtures/bubble_vectors.json',
    );
    writeFileSync(out, JSON.stringify({ source: 'src/lib/ai/cloud-sender.ts#splitIntoBubbles', vectors }, null, 2) + '\n');
    expect(vectors.length).toBe(CASES.length);
  });
});
