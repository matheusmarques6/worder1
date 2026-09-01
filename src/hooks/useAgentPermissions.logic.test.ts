/**
 * Fix round 1 do item 21: o mesmo fail-open sobrevivia em dois lugares que
 * a leitura de código sozinha não travava no CI.
 *
 * 1. `permissionsStateOnFailure()` — o estado que `!res.ok` e o `catch`
 *    aplicam quando a rota de identidade falha. Antes virava
 *    `isAdmin: true`; se alguém reverter a chamada de volta pra isso, este
 *    teste quebra.
 *
 * 2. `accessGate()` — o que os helpers de acesso (`canAccessNumber`,
 *    `canAccessPipeline`, `canAccess`, `canAccessRoute`) respondem ANTES do
 *    fetch resolver. `isAgent` começa `false`, e todo helper tinha
 *    `if (!isAgent) return true` — ou seja, "admin até prova em contrário"
 *    disfarçado de outra flag, só que na janela de loading em vez de na
 *    falha de rede. `isLoading` tem que vencer e negar, do mesmo jeito que
 *    a rota nega quando não sabe quem é.
 */

import { describe, it, expect } from 'vitest'
import { permissionsStateOnFailure, accessGate, RESTRICTIVE_AGENT_DEFAULTS } from './useAgentPermissions'

describe('permissionsStateOnFailure', () => {
  it('nunca é admin', () => {
    const estado = permissionsStateOnFailure()
    expect(estado.isAdmin).toBe(false)
  })

  it('vira agente com os defaults restritivos, não acesso total', () => {
    const estado = permissionsStateOnFailure()
    expect(estado.isAgent).toBe(true)
    expect(estado.permissions).toBe(RESTRICTIVE_AGENT_DEFAULTS)
    expect(estado.permissions.whatsappAccessAll).toBe(false)
    expect(estado.permissions.canAccessPipelines).toBe(false)
  })
})

describe('accessGate — loading nega, não é admin até prova em contrário', () => {
  it('carregando: nega mesmo que isAdmin/isAgent ainda estejam nos defaults iniciais', () => {
    // Estado inicial do hook antes do primeiro fetch resolver:
    // isAdmin=false, isAgent=false — exatamente o combo que os helpers
    // antigos liam como "não é agente, libera geral".
    expect(accessGate(true, false, false)).toBe('deny')
  })

  it('carregando: nega mesmo se algum estado anterior deixou isAdmin true', () => {
    expect(accessGate(true, true, false)).toBe('deny')
  })

  it('resolvido, admin: libera', () => {
    expect(accessGate(false, true, false)).toBe('allow')
  })

  it('resolvido, não-agente (dono da loja): libera', () => {
    expect(accessGate(false, false, false)).toBe('allow')
  })

  it('resolvido, agente: manda checar as permissões dele', () => {
    expect(accessGate(false, false, true)).toBe('check-permissions')
  })
})
