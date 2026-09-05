// Papéis da equipe (Configurações → Equipe e permissões).
// No banco (enum user_role): owner, admin, member, analyst, agent.
// Na tela: Proprietário, Administrador, Editor, Analista, Suporte.

export type TeamRole = 'owner' | 'admin' | 'member' | 'analyst' | 'agent'

export const ASSIGNABLE_ROLES: Array<{ value: Exclude<TeamRole, 'owner'>; label: string; desc: string }> = [
  { value: 'admin', label: 'Administrador', desc: 'Tudo, exceto excluir a organização.' },
  { value: 'member', label: 'Editor', desc: 'Cria e envia campanhas, edita automações e segmentos.' },
  { value: 'analyst', label: 'Analista', desc: 'Só leitura: relatórios, receita e campanhas.' },
  { value: 'agent', label: 'Suporte', desc: 'Responde no Inbox do WhatsApp e gerencia contatos.' },
]

export const ROLE_LABEL: Record<string, string> = {
  owner: 'Proprietário',
  admin: 'Administrador',
  member: 'Editor',
  editor: 'Editor',
  analyst: 'Analista',
  viewer: 'Analista',
  agent: 'Suporte',
}

export function roleLabel(role: string | null | undefined): string {
  return ROLE_LABEL[role || ''] || role || '—'
}

/** Matriz exibida no card "Funções" — [permissão, admin, editor, analista, suporte]. */
export const ROLE_MATRIX: Array<[string, 0 | 1, 0 | 1, 0 | 1, 0 | 1]> = [
  ['Criar e enviar campanhas', 1, 1, 0, 0],
  ['Editar automações', 1, 1, 0, 0],
  ['Ver relatórios e receita', 1, 1, 1, 0],
  ['Gerenciar contatos e segmentos', 1, 1, 0, 1],
  ['Responder no Inbox do WhatsApp', 1, 0, 0, 1],
  ['Faturamento e plano', 1, 0, 0, 0],
  ['Convidar pessoas', 1, 0, 0, 0],
]
