// =============================================
// diff.ts — pure helper unit tests (Bloco F1)
//
// Covers the LCS line diff and the versionable-change detector used
// by the agent versioning service.
// =============================================

import { describe, it, expect } from 'vitest';
import { diffLines, hasVersionableChanges } from '../diff';

describe('diffLines', () => {
  it('identical inputs produce only ctx lines', () => {
    expect(diffLines('a\nb\nc', 'a\nb\nc')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'ctx', text: 'b' },
      { type: 'ctx', text: 'c' },
    ]);
  });

  it('pure additions', () => {
    expect(diffLines('a\nc', 'a\nb\nc')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'add', text: 'b' },
      { type: 'ctx', text: 'c' },
    ]);
    expect(diffLines('a', 'a\nb\nc')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'add', text: 'b' },
      { type: 'add', text: 'c' },
    ]);
  });

  it('pure removals', () => {
    expect(diffLines('a\nb\nc', 'a\nc')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'rem', text: 'b' },
      { type: 'ctx', text: 'c' },
    ]);
  });

  it('replacement yields rem then add', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'rem', text: 'b' },
      { type: 'add', text: 'x' },
      { type: 'ctx', text: 'c' },
    ]);
  });

  it('empty prev → everything added (first version)', () => {
    expect(diffLines('', 'a\nb')).toEqual([
      { type: 'add', text: 'a' },
      { type: 'add', text: 'b' },
    ]);
  });

  it('empty next → everything removed', () => {
    expect(diffLines('a\nb', '')).toEqual([
      { type: 'rem', text: 'a' },
      { type: 'rem', text: 'b' },
    ]);
  });

  it('both empty → []', () => {
    expect(diffLines('', '')).toEqual([]);
  });

  it('multiline with repeated lines follows the LCS (no naive pairing)', () => {
    // LCS of [x,a,b,a] vs [a,b,a,y] is [a,b,a]
    expect(diffLines('x\na\nb\na', 'a\nb\na\ny')).toEqual([
      { type: 'rem', text: 'x' },
      { type: 'ctx', text: 'a' },
      { type: 'ctx', text: 'b' },
      { type: 'ctx', text: 'a' },
      { type: 'add', text: 'y' },
    ]);
  });

  it('duplicate lines collapse to a single ctx + rem', () => {
    expect(diffLines('a\na', 'a')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'rem', text: 'a' },
    ]);
  });

  it('normalizes CRLF line endings', () => {
    expect(diffLines('a\r\nb', 'a\nb')).toEqual([
      { type: 'ctx', text: 'a' },
      { type: 'ctx', text: 'b' },
    ]);
  });
});

describe('hasVersionableChanges', () => {
  const current = {
    system_prompt: 'Você é um assistente.',
    persona: { tone: 'friendly', language: 'pt-BR' },
    settings: { auto_handoff: true, max_messages: 10 },
  };

  it('detects system_prompt change only', () => {
    expect(
      hasVersionableChanges(current, { system_prompt: 'Outro prompt.' })
    ).toEqual(['system_prompt']);
  });

  it('detects persona change only', () => {
    expect(
      hasVersionableChanges(current, { persona: { tone: 'luxury', language: 'pt-BR' } })
    ).toEqual(['persona']);
  });

  it('detects settings change only', () => {
    expect(
      hasVersionableChanges(current, { settings: { auto_handoff: false, max_messages: 10 } })
    ).toEqual(['settings']);
  });

  it('detects multiple changed fields in order', () => {
    expect(
      hasVersionableChanges(current, { system_prompt: 'Novo.', settings: { auto_handoff: false } })
    ).toEqual(['system_prompt', 'settings']);
  });

  it('same jsonb with different key order is unchanged (deep equality)', () => {
    expect(
      hasVersionableChanges(current, {
        persona: { language: 'pt-BR', tone: 'friendly' },
        settings: { max_messages: 10, auto_handoff: true },
      })
    ).toEqual([]);
  });

  it('nested objects compare deeply regardless of key order', () => {
    const cur = { settings: { a: { x: 1, y: [1, 2] }, b: 'z' } };
    expect(hasVersionableChanges(cur, { settings: { b: 'z', a: { y: [1, 2], x: 1 } } })).toEqual([]);
    expect(hasVersionableChanges(cur, { settings: { b: 'z', a: { y: [2, 1], x: 1 } } })).toEqual(['settings']);
  });

  it('undefined incoming field = unchanged', () => {
    expect(hasVersionableChanges(current, {})).toEqual([]);
    expect(hasVersionableChanges(current, { system_prompt: undefined })).toEqual([]);
  });

  it('identical system_prompt is unchanged', () => {
    expect(hasVersionableChanges(current, { system_prompt: current.system_prompt })).toEqual([]);
  });

  it('treats null current field equal to incoming null', () => {
    expect(hasVersionableChanges({ system_prompt: null }, { system_prompt: null })).toEqual([]);
    expect(hasVersionableChanges({}, { persona: null })).toEqual([]);
  });

  it('null → value counts as change', () => {
    expect(hasVersionableChanges({ system_prompt: null }, { system_prompt: 'x' })).toEqual(['system_prompt']);
  });
});
