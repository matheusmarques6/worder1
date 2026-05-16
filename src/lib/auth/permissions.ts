// =============================================
// WORDER: Role-based permissions
// /src/lib/auth/permissions.ts
//
// Inspirado em Klaviyo + Omnisend. Quatro roles já existem no
// schema (organization_members.role): owner, admin, member, agent.
// Esse módulo define o que cada um pode fazer e dá um único
// helper canRoleAccess(role, capability) que outros endpoints e
// componentes usam pra checar.
//
// Hierarquia:
//   - owner: tudo (single seat, dono da org)
//   - admin: tudo exceto deletar a org e gerenciar billing
//   - member: cria/edita campanhas, fluxos, segmentos, mas não
//             convida usuários nem mexe em integrações críticas
//   - agent:  read-only nos dashboards + responde inbox WhatsApp/
//             email; não cria campanha nem altera audience
//
// Filosofia: capability strings são curtas e descritivas, não
// genéricas (campaigns:edit, não generic "write"). Lendo só o
// callsite, dá pra entender o que está sendo pedido.
// =============================================

export type Role = 'owner' | 'admin' | 'member' | 'agent'

export type Capability =
  // org-level
  | 'org:delete'
  | 'org:settings:edit'
  | 'org:billing:view'
  | 'org:billing:edit'
  | 'org:members:invite'
  | 'org:members:remove'
  | 'org:members:role:change'
  | 'org:audit_log:view'
  | 'org:api_keys:manage'
  // store-level
  | 'store:connect'
  | 'store:disconnect'
  | 'store:settings:edit'
  // marketing surfaces
  | 'campaigns:view'
  | 'campaigns:create'
  | 'campaigns:edit'
  | 'campaigns:send'
  | 'campaigns:delete'
  | 'automations:view'
  | 'automations:create'
  | 'automations:edit'
  | 'automations:activate'
  | 'automations:delete'
  | 'segments:view'
  | 'segments:create'
  | 'segments:edit'
  | 'segments:delete'
  | 'forms:view'
  | 'forms:create'
  | 'forms:edit'
  | 'forms:publish'
  | 'forms:delete'
  | 'templates:view'
  | 'templates:edit'
  | 'contacts:view'
  | 'contacts:export'
  | 'contacts:edit'
  | 'contacts:delete'
  | 'contacts:import'
  // analytics + CRM
  | 'analytics:view'
  | 'crm:view'
  | 'crm:edit'
  | 'crm:delete'
  | 'reports:view'
  | 'reports:export'
  // inbox / agent surfaces
  | 'inbox:reply'
  | 'inbox:assign'
  | 'inbox:close'
  // integrations / deliverability
  | 'integrations:view'
  | 'integrations:edit'
  | 'integrations:disconnect'
  | 'domains:edit'

// Matrix. Each role lists exactly what it CAN do. Anything not
// listed is denied. Owner is always allowed (sentinel checked
// before the matrix lookup so we don't have to enumerate the world).
const CAPABILITIES: Record<Exclude<Role, 'owner'>, Set<Capability>> = {
  admin: new Set<Capability>([
    'org:settings:edit', 'org:members:invite', 'org:members:remove',
    'org:members:role:change', 'org:audit_log:view', 'org:api_keys:manage',
    'org:billing:view',
    'store:connect', 'store:disconnect', 'store:settings:edit',
    'campaigns:view', 'campaigns:create', 'campaigns:edit', 'campaigns:send', 'campaigns:delete',
    'automations:view', 'automations:create', 'automations:edit', 'automations:activate', 'automations:delete',
    'segments:view', 'segments:create', 'segments:edit', 'segments:delete',
    'forms:view', 'forms:create', 'forms:edit', 'forms:publish', 'forms:delete',
    'templates:view', 'templates:edit',
    'contacts:view', 'contacts:export', 'contacts:edit', 'contacts:delete', 'contacts:import',
    'analytics:view', 'crm:view', 'crm:edit', 'crm:delete',
    'reports:view', 'reports:export',
    'inbox:reply', 'inbox:assign', 'inbox:close',
    'integrations:view', 'integrations:edit', 'integrations:disconnect', 'domains:edit',
  ]),
  member: new Set<Capability>([
    'store:settings:edit',
    'campaigns:view', 'campaigns:create', 'campaigns:edit', 'campaigns:send',
    'automations:view', 'automations:create', 'automations:edit', 'automations:activate',
    'segments:view', 'segments:create', 'segments:edit',
    'forms:view', 'forms:create', 'forms:edit', 'forms:publish',
    'templates:view', 'templates:edit',
    'contacts:view', 'contacts:export', 'contacts:edit', 'contacts:import',
    'analytics:view', 'crm:view', 'crm:edit',
    'reports:view', 'reports:export',
    'inbox:reply', 'inbox:assign',
    'integrations:view',
  ]),
  agent: new Set<Capability>([
    'campaigns:view',
    'automations:view',
    'segments:view',
    'forms:view',
    'templates:view',
    'contacts:view',
    'analytics:view',
    'crm:view',
    'reports:view',
    'inbox:reply', 'inbox:close',
  ]),
}

/**
 * Returns true iff the role grants the given capability.
 * Unknown roles default to deny.
 */
export function canRoleAccess(role: Role | string | null | undefined, capability: Capability): boolean {
  if (!role) return false
  if (role === 'owner') return true
  const set = CAPABILITIES[role as Exclude<Role, 'owner'>]
  return set ? set.has(capability) : false
}

/** Returns the full capability set for UI gating (e.g., hide a menu). */
export function capabilitiesForRole(role: Role | string | null | undefined): Set<Capability> {
  if (!role) return new Set()
  if (role === 'owner') {
    return new Set<Capability>(Object.values(CAPABILITIES).flatMap((s) => Array.from(s)).concat([
      'org:delete', 'org:billing:edit',
    ]))
  }
  return new Set(CAPABILITIES[role as Exclude<Role, 'owner'>] || [])
}
