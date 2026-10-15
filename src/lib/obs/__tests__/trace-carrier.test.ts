import { describe, expect, it } from 'vitest'
import { currentTraceCarrier } from '../trace-carrier'

describe('currentTraceCarrier', () => {
  it('sem OpenTelemetry registrado não inventa contexto', () => {
    expect(currentTraceCarrier()).toBeNull()
  })
})
