import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isWithinSchedule } from '../guards'

const { schedules } = JSON.parse(readFileSync('fixtures/ai-guard-contract.json', 'utf8')) as {
  schedules: Array<{ id: string; now: string; schedule: Parameters<typeof isWithinSchedule>[0]; expected: boolean }>
}

describe('contrato comum de horários', () => {
  for (const testCase of schedules) {
    it(testCase.id, () => {
      expect(isWithinSchedule(testCase.schedule, new Date(testCase.now))).toBe(testCase.expected)
    })
  }
})
