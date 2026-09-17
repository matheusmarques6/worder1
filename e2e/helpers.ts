import { test } from '@playwright/test'

/**
 * Sem credenciais os testes são pulados, com o motivo à vista, ANTES de
 * qualquer navegador subir. Falhar por falta de segredo treina a equipe a
 * ignorar vermelho; passar sem ter testado nada é pior ainda.
 */
export function skipWithoutCredentials(runner: typeof test = test): void {
  const faltando = !process.env.E2E_EMAIL || !process.env.E2E_PASSWORD
  runner.skip(faltando, 'defina E2E_EMAIL e E2E_PASSWORD para rodar os testes de ponta a ponta')
}

export function credentials(): { email: string; password: string } {
  return { email: process.env.E2E_EMAIL || '', password: process.env.E2E_PASSWORD || '' }
}

/** Nome único por execução, para um teste não tropeçar no lixo do outro. */
export function uniqueName(prefix: string): string {
  return `${prefix} e2e ${Date.now().toString(36)}`
}
