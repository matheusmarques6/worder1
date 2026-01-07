# 🎯 Menu do Header Completo

## ✅ O que foi implementado

### 1. Menu Dropdown Clicável
- Avatar real (foto do perfil) em vez de iniciais
- Nome e cargo do usuário
- Botões funcionais que navegam para as páginas

### 2. Lista de Agentes Online/Offline
- Mostra todos os agentes da organização
- Bolinha verde = online, cinza = offline
- Atualiza quando o menu abre

### 3. Navegação Funcional
- **Meu Perfil** → `/settings?tab=profile`
- **Configurações da Loja** → `/settings?tab=store`
- **Faturamento** → `/settings?tab=billing`
- **Integrações** → `/settings?tab=integrations`

### 4. Logout Funcional
- Faz logout real via API
- Redireciona para página de login

### 5. Sistema de Heartbeat (para agentes)
- Envia ping a cada 30 segundos
- Atualiza status para "online"
- Marca "offline" ao fechar a página

---

## 📦 Arquivos Incluídos

```
src/
├── components/
│   └── layout/
│       └── Header.tsx          ← MODIFICADO (menu dropdown completo)
├── app/
│   └── api/
│       └── agents/
│           └── status/
│               └── route.ts    ← NOVO (API de status dos agentes)
└── hooks/
    └── useHeartbeat.ts         ← NOVO (heartbeat para agentes)
```

---

## 🚀 Instalação

### Passo 1: Execute o SQL no Supabase

```sql
-- Adicionar colunas na tabela agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- Índices
CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
CREATE INDEX IF NOT EXISTS idx_agents_last_seen ON agents(last_seen_at);
```

### Passo 2: Substitua os arquivos

Extraia o ZIP e copie a pasta `src` para o seu projeto.

### Passo 3: (Opcional) Adicionar heartbeat no layout

Se quiser que agentes enviem heartbeat automaticamente, adicione no layout principal:

```tsx
// src/app/(dashboard)/layout.tsx
import { useHeartbeat } from '@/hooks/useHeartbeat';

export default function DashboardLayout({ children }) {
  useHeartbeat(); // Adicione esta linha
  
  return (
    // ... resto do layout
  );
}
```

### Passo 4: Deploy

```bash
git add .
git commit -m "feat: menu do header com agentes online e logout funcional"
git push
```

---

## 🎨 Visual do Menu

```
┌─────────────────────────────────┐
│  [Avatar] Convertfy Convertfy   │
│           acessos@convertfy.me  │
│           🏷️ Administrador      │
│  ───────────────────────────────│
│  👥 Agentes (2 online)          │
│     🟢 João Silva               │
│     🟢 Maria Santos             │
│     ⚫ Pedro Costa              │
│  ───────────────────────────────│
│  👤 Meu Perfil                  │
│  🏪 Configurações da Loja       │
│  💳 Faturamento                 │
│  ⚙️ Integrações                 │
│  ───────────────────────────────│
│  🌙 Modo Escuro         [○━━]   │
│  ───────────────────────────────│
│  🚪 Sair                        │
└─────────────────────────────────┘
```

---

## ✅ Funcionalidades

| Funcionalidade | Status |
|----------------|--------|
| Avatar real (foto) | ✅ |
| Nome e cargo | ✅ |
| Lista de agentes | ✅ |
| Status online/offline | ✅ |
| Navegação funcional | ✅ |
| Logout funcional | ✅ |
| Toggle tema dark/light | ✅ |
| Heartbeat para agentes | ✅ |

---

## 🔒 Segurança

- Cada organização só vê seus próprios agentes
- O heartbeat só funciona para usuários que são agentes
- Logout limpa sessão no servidor e no cliente
