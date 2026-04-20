import { describe, it, expect } from 'vitest';
import { classifyResponse } from '../response-classifier';

describe('classifyResponse', () => {
  it('2xx → delivered', () => {
    expect(classifyResponse(200, 1)).toBe('delivered');
    expect(classifyResponse(204, 1)).toBe('delivered');
  });

  it('5xx → retrying se attempt < max', () => {
    expect(classifyResponse(500, 1, 5)).toBe('retrying');
    expect(classifyResponse(502, 4, 5)).toBe('retrying');
  });

  it('5xx → failed se attempt >= max', () => {
    expect(classifyResponse(500, 5, 5)).toBe('failed');
  });

  it('408/429 → retrying', () => {
    expect(classifyResponse(408, 1, 5)).toBe('retrying');
    expect(classifyResponse(429, 1, 5)).toBe('retrying');
  });

  it('4xx outros → failed', () => {
    expect(classifyResponse(400, 1, 5)).toBe('failed');
    expect(classifyResponse(404, 1, 5)).toBe('failed');
    expect(classifyResponse(403, 1, 5)).toBe('failed');
  });
});
