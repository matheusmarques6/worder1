# 🔧 Correção: Menu do Usuário no Sidebar

## ❌ Problema
O menu do usuário estava no Header, mas o botão visível estava no **Sidebar**.

## ✅ Solução
Adicionei o menu dropdown completo no **Sidebar.tsx** (local correto).

---

## 📦 Arquivos Incluídos

```
src/
├── components/
│   └── layout/
│       └── Sidebar.tsx         ← MODIFICADO (menu dropdown completo)
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
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMP;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'offline';
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
```

### Passo 2: Substitua os arquivos e deploy

```bash
git add .
git commit -m "feat: menu dropdown do usuário com agentes online"
git push
```

---

## 🎨 Visual do Menu

```
┌─────────────────────────────────┐
│  [📷 Foto] Convertfy Convertfy  │
│           acessos@convertfy.me  │
│           🏷️ Administrador      │
│  ───────────────────────────────│
│  👥 Agentes (2 online)          │
│     🟢 João Silva               │
│     ⚫ Pedro Costa              │
│  ───────────────────────────────│
│  👤 Meu Perfil                  │
│  🏪 Configurações da Loja       │
│  ⚙️ Integrações                 │
│  ───────────────────────────────│
│  🚪 Sair                        │
└─────────────────────────────────┘
```

---

## ✅ Funcionalidades

| Funcionalidade | Status |
|----------------|--------|
| Avatar real (foto do perfil) | ✅ |
| Menu clicável | ✅ |
| Nome e cargo | ✅ |
| Lista de agentes online/offline | ✅ |
| Link para Meu Perfil | ✅ |
| Link para Configurações | ✅ |
| Link para Integrações | ✅ |
| Logout funcional | ✅ |
