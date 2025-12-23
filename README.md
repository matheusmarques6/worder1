# WhatsApp Health Checker + Hub de Integrações

## 📦 Conteúdo do Pacote

```
src/
├── app/
│   ├── (dashboard)/integrations/hub/
│   │   └── page.tsx                    ← Hub de Integrações (UI)
│   └── api/integrations/
│       ├── health/
│       │   ├── route.ts                ← API de health check
│       │   └── logs/route.ts           ← API de histórico
│       └── status/route.ts             ← API de status geral (CORRIGIDO)
└── lib/services/integration-health/
    ├── checkers/
    │   ├── base.ts
    │   ├── shopify.ts
    │   └── whatsapp.ts                 ← NOVO: Checker do WhatsApp
    ├── health-checker.ts               ← ATUALIZADO: inclui WhatsApp
    ├── index.ts                        ← ATUALIZADO: exporta WhatsApp
    ├── notifier.ts
    └── types.ts
```

## ⚡ Instalação

### 1. Extrair arquivos
```bash
unzip -o WHATSAPP-HEALTH-CHECKER.zip -d .
```

### 2. Verificar que as tabelas existem no Supabase
Execute no SQL Editor se ainda não executou:

```sql
-- Se já executou PASSO-A e PASSO-B, pule esta etapa

-- Adicionar colunas à whatsapp_configs (se faltarem)
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS connection_status TEXT DEFAULT 'pending';
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS status_message TEXT;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS status_code INTEGER;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS health_checked_at TIMESTAMPTZ;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS consecutive_failures INTEGER DEFAULT 0;
ALTER TABLE whatsapp_configs ADD COLUMN IF NOT EXISTS last_notification_at TIMESTAMPTZ;

-- Criar tabela de logs (se não existir)
CREATE TABLE IF NOT EXISTS integration_health_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  integration_type TEXT NOT NULL,
  integration_id UUID NOT NULL,
  integration_name TEXT,
  status TEXT NOT NULL CHECK (status IN ('success', 'warning', 'error')),
  status_code TEXT,
  message TEXT,
  response_time_ms INTEGER,
  details JSONB DEFAULT '{}',
  checked_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_health_logs_org ON integration_health_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_health_logs_checked ON integration_health_logs(checked_at DESC);
```

### 3. (Opcional) Adicionar ao menu lateral

Edite `src/components/layout/Sidebar.tsx`:

```typescript
// Adicionar import
import { ..., Puzzle } from 'lucide-react'

// Adicionar ao mainNavItems (linha ~83)
{ title: 'Integrações', href: '/integrations/hub', icon: Puzzle },
```

## 🧪 Testar

### Via Browser
Acesse: `http://localhost:3000/integrations/hub`

### Via API

```bash
# Status de todas integrações
curl "http://localhost:3000/api/integrations/status"

# Health check manual do WhatsApp
curl -X POST http://localhost:3000/api/integrations/health \
  -H "Content-Type: application/json" \
  -d '{"type":"whatsapp","integrationId":"SEU_WHATSAPP_ID"}'

# Verificar todas integrações de uma organização
curl -X POST http://localhost:3000/api/integrations/health \
  -H "Content-Type: application/json" \
  -d '{"checkAll":true,"organizationId":"SEU_ORG_ID"}'

# Ver histórico de verificações
curl "http://localhost:3000/api/integrations/health/logs?organizationId=SEU_ORG_ID"
```

### Via Cron Job
```bash
# Executar verificação automática
curl http://localhost:3000/api/cron/check-integrations
```

## 🔍 Verificações do WhatsApp

| Código | Status | Descrição |
|--------|--------|-----------|
| 200 | ✅ active | API funcionando normalmente |
| 200 + RED | ⚠️ warning | Qualidade do número baixa |
| 200 + YELLOW | ⚠️ warning | Qualidade média |
| 190 | 🔴 expired | Token expirado |
| 100 | 🔴 error | Phone Number ID inválido |
| 10/200 | 🔴 error | Permissões insuficientes |
| 368 | 🔴 error | Conta bloqueada |
| 4/17/613 | ⚠️ warning | Rate limit |

## 📊 Hub de Integrações

O Hub mostra:
- Cards com status de cada integração (Shopify, WhatsApp)
- Indicadores visuais: 🟢 Saudável / 🟡 Atenção / 🔴 Problema
- Botão para verificar manualmente cada integração
- Botão para verificar todas de uma vez
- Histórico das últimas 10 verificações
- Auto-refresh a cada 60 segundos

## 🔄 Fluxo de Dados

```
Cron Job (6h) ou Manual
        ↓
health-checker.ts
        ↓
WhatsAppHealthChecker / ShopifyHealthChecker
        ↓
Atualiza connection_status no banco
        ↓
Cria notificação se necessário
        ↓
Hub de Integrações exibe status
```

## 📁 Arquivos Modificados vs Novos

| Arquivo | Tipo |
|---------|------|
| `checkers/whatsapp.ts` | **NOVO** |
| `health-checker.ts` | MODIFICADO |
| `index.ts` | MODIFICADO |
| `api/integrations/status/route.ts` | MODIFICADO |
| `api/integrations/health/logs/route.ts` | **NOVO** |
| `integrations/hub/page.tsx` | **NOVO** |
