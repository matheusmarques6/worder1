// =============================================
// flywheel.test.ts — pure helper unit tests (Bloco F2)
//
// Covers computeFlywheelStats: composição do for_fine_tune, cobertura
// (0% / parcial com arredondamento / 100%), entradas vazias sem NaN,
// e contagem de correções.
// =============================================

import { describe, it, expect } from 'vitest';
import { computeFlywheelStats } from '../annotations';

describe('computeFlywheelStats', () => {
  it('for_fine_tune = good + corrected fix', () => {
    const stats = computeFlywheelStats({
      annotated: 10,
      corrections: 3,
      goodCount: 7,
      correctedFixCount: 3,
      totalTraces: 20,
    });
    expect(stats.for_fine_tune).toBe(10);
    expect(stats.annotated).toBe(10);
    expect(stats.corrections).toBe(3);
  });

  it('coverage 0% quando não há traces (sem divide-by-zero)', () => {
    const stats = computeFlywheelStats({
      annotated: 0,
      corrections: 0,
      goodCount: 0,
      correctedFixCount: 0,
      totalTraces: 0,
    });
    expect(stats.coverage).toBe(0);
    expect(Number.isNaN(stats.coverage)).toBe(false);
  });

  it('coverage 0% com traces mas zero anotadas', () => {
    const stats = computeFlywheelStats({
      annotated: 0,
      corrections: 0,
      goodCount: 0,
      correctedFixCount: 0,
      totalTraces: 50,
    });
    expect(stats.coverage).toBe(0);
  });

  it('coverage parcial arredonda (1/3 → 33%)', () => {
    const stats = computeFlywheelStats({
      annotated: 1,
      corrections: 0,
      goodCount: 1,
      correctedFixCount: 0,
      totalTraces: 3,
    });
    expect(stats.coverage).toBe(33);
  });

  it('coverage parcial arredonda para cima (2/3 → 67%)', () => {
    const stats = computeFlywheelStats({
      annotated: 2,
      corrections: 0,
      goodCount: 0,
      correctedFixCount: 0,
      totalTraces: 3,
    });
    expect(stats.coverage).toBe(67);
  });

  it('coverage 100% quando todas anotadas', () => {
    const stats = computeFlywheelStats({
      annotated: 12,
      corrections: 4,
      goodCount: 6,
      correctedFixCount: 4,
      totalTraces: 12,
    });
    expect(stats.coverage).toBe(100);
    expect(stats.for_fine_tune).toBe(10);
  });

  it('entradas vazias → tudo zero, nunca NaN', () => {
    const stats = computeFlywheelStats({
      annotated: 0,
      corrections: 0,
      goodCount: 0,
      correctedFixCount: 0,
      totalTraces: 0,
    });
    expect(stats).toEqual({ annotated: 0, corrections: 0, for_fine_tune: 0, coverage: 0 });
    expect(Object.values(stats).some((v) => Number.isNaN(v))).toBe(false);
  });

  it('corrections é independente do for_fine_tune (só fix com texto)', () => {
    // 5 boas, 2 fix com texto → for_fine_tune 7, corrections 2
    const stats = computeFlywheelStats({
      annotated: 9,
      corrections: 2,
      goodCount: 5,
      correctedFixCount: 2,
      totalTraces: 30,
    });
    expect(stats.corrections).toBe(2);
    expect(stats.for_fine_tune).toBe(7);
  });

  it('campos ausentes/undefined tratados como zero', () => {
    const stats = computeFlywheelStats({
      annotated: undefined as any,
      corrections: undefined as any,
      goodCount: undefined as any,
      correctedFixCount: undefined as any,
      totalTraces: undefined as any,
    });
    expect(stats).toEqual({ annotated: 0, corrections: 0, for_fine_tune: 0, coverage: 0 });
  });
});
