import { describe, it, expect } from 'vitest';
import {
  AI_RUN_STEPS,
  TERMINAL_AI_RUN_STEPS,
  describeToolCall,
  isTerminalAiRunStep,
} from './run-steps';

describe('isTerminalAiRunStep', () => {
  it('reconhece os 4 terminais', () => {
    expect(isTerminalAiRunStep('sent')).toBe(true);
    expect(isTerminalAiRunStep('transferred')).toBe(true);
    expect(isTerminalAiRunStep('skipped')).toBe(true);
    expect(isTerminalAiRunStep('failed')).toBe(true);
  });

  it('passos de progresso nao sao terminais', () => {
    for (const s of ['queued', 'started', 'transcribing', 'analyzing_image', 'generating', 'tools', 'sending']) {
      expect(isTerminalAiRunStep(s)).toBe(false);
    }
  });

  it('string desconhecida nao e terminal', () => {
    // Passo novo no runner nao pode acidentalmente encerrar o painel.
    expect(isTerminalAiRunStep('algo_novo')).toBe(false);
  });

  it('todo passo do vocabulario e terminal OU de progresso, nunca ambos', () => {
    const all = Object.values(AI_RUN_STEPS);
    const terminals = all.filter((s) => isTerminalAiRunStep(s));
    expect(terminals.sort()).toEqual([...TERMINAL_AI_RUN_STEPS].sort());
    // Garante que o painel sempre tem como encerrar: existe pelo menos 1
    // terminal e pelo menos 1 de progresso.
    expect(terminals.length).toBeGreaterThan(0);
    expect(all.length - terminals.length).toBeGreaterThan(0);
  });
});

describe('describeToolCall', () => {
  it('traduz tools conhecidas', () => {
    expect(describeToolCall('get_order_status')).toBe('Consultando status do pedido');
    expect(describeToolCall('search_products')).toBe('Buscando produtos');
  });

  it('tool desconhecida vira texto legivel, sem snake_case', () => {
    expect(describeToolCall('check_stock_level')).toBe('Usando check stock level');
  });

  it('nunca devolve vazio', () => {
    expect(describeToolCall('x')).toBeTruthy();
  });
});
