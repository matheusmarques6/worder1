// =============================================================
// Evento repetido não é lixo — é o mesmo fato, quase sempre mais
// completo.
//
// A Shopify manda checkouts/create magro e checkouts/update depois com
// o abandoned_checkout_url, os itens e o e-mail; e reenvia cada webhook
// até 8 vezes. Guardar só a primeira entrega jogava fora exatamente o
// campo de que o fluxo de recuperação precisa.
//
// A regra travada aqui: o mais novo ganha campo a campo, mas só quando
// traz valor. Uma entrega magra que chega depois nunca apaga o que já
// sabíamos.
// =============================================================

import { describe, it, expect } from 'vitest';
import { mergeEventProperties } from '../event-service';

describe('mergeEventProperties', () => {
  it('o update traz o link do checkout que faltava no create', () => {
    const r = mergeEventProperties(
      { CheckoutID: '1', TotalPrice: '100' },
      { CheckoutURL: 'https://loja/recover/1' }
    );
    expect(r).toEqual({
      CheckoutID: '1', TotalPrice: '100', CheckoutURL: 'https://loja/recover/1',
    });
  });

  it('entrega magra depois NÃO apaga o que já sabíamos', () => {
    const r = mergeEventProperties(
      { CheckoutURL: 'https://loja/recover/1', Email: 'a@b.com' },
      { CheckoutURL: null, Email: '', TotalPrice: '100' }
    );
    expect(r).toEqual({
      CheckoutURL: 'https://loja/recover/1', Email: 'a@b.com', TotalPrice: '100',
    });
  });

  it('valor novo de verdade sobrescreve o antigo', () => {
    const r = mergeEventProperties({ TotalPrice: '100' }, { TotalPrice: '250' });
    expect(r).toEqual({ TotalPrice: '250' });
  });

  it('objeto aninhado junta em vez de substituir', () => {
    // O update traz só o e-mail do cliente; o nome que veio no create
    // não pode sumir.
    const r = mergeEventProperties(
      { Customer: { FirstName: 'Maria', LastName: 'Silva' } },
      { Customer: { Email: 'maria@x.com' } }
    );
    expect(r).toEqual({
      Customer: { FirstName: 'Maria', LastName: 'Silva', Email: 'maria@x.com' },
    });
  });

  it('o raw mais completo entra sem apagar os campos anteriores', () => {
    const r = mergeEventProperties(
      { raw: { id: 1, total_price: '100' } },
      { raw: { id: 1, abandoned_checkout_url: 'https://x' } }
    );
    expect(r!.raw).toEqual({
      id: 1, total_price: '100', abandoned_checkout_url: 'https://x',
    });
  });

  it('lista nova substitui a antiga (itens do carrinho mudaram)', () => {
    const r = mergeEventProperties(
      { Items: [{ ProductName: 'A' }] },
      { Items: [{ ProductName: 'A' }, { ProductName: 'B' }] }
    );
    expect(r!.Items).toHaveLength(2);
  });

  it('lista vazia não apaga a lista que existia', () => {
    const r = mergeEventProperties({ Items: [{ ProductName: 'A' }] }, { Items: [] });
    expect(r).toBeNull();
  });

  it('entrega idêntica não gera gravação', () => {
    expect(mergeEventProperties({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBeNull();
  });

  it('nada de novo devolve null, não um objeto igual', () => {
    expect(mergeEventProperties({ a: 1 }, {})).toBeNull();
    expect(mergeEventProperties({ a: 1 }, null)).toBeNull();
  });

  it('primeiro evento sem antecessor funciona', () => {
    expect(mergeEventProperties(null, { a: 1 })).toEqual({ a: 1 });
  });

  it('zero e false são valores, não ausência', () => {
    const r = mergeEventProperties({ TotalDiscounts: '10' }, { TotalDiscounts: 0, Test: false });
    expect(r).toEqual({ TotalDiscounts: 0, Test: false });
  });

  it('o caso real: create magro, depois update completo', () => {
    const create = {
      CheckoutID: '987',
      Customer: { Email: null },
      Items: [],
      raw: { id: 987, token: 'abc' },
    };
    const update = {
      CheckoutURL: 'https://loja/checkouts/abc/recover',
      Customer: { Email: 'cliente@x.com', FirstName: 'João' },
      Items: [{ ProductName: 'Camiseta', ItemPrice: '89.90' }],
      TotalPrice: '89.90',
      raw: { id: 987, token: 'abc', abandoned_checkout_url: 'https://loja/checkouts/abc/recover' },
    };
    const r = mergeEventProperties(create, update)!;
    expect(r.CheckoutURL).toBe('https://loja/checkouts/abc/recover');
    expect(r.Customer).toEqual({ Email: 'cliente@x.com', FirstName: 'João' });
    expect(r.Items).toHaveLength(1);
    expect(r.CheckoutID).toBe('987');           // veio do create e sobreviveu
    expect(r.raw.token).toBe('abc');
    expect(r.raw.abandoned_checkout_url).toBeTruthy();
  });
});
