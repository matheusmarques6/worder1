import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/redis/**/*.test.ts'],
    maxWorkers: 1,
    minWorkers: 1,
    // Deliberately no app setup: it installs Redis/SDK mocks.
  },
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
})
