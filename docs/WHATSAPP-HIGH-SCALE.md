# 🚀 WhatsApp CRM - Sistema de Alta Escala

## 📋 Visão Geral

Sistema de campanhas WhatsApp otimizado para alto volume:
- **Rate limiting adaptativo** por tier da Meta
- **Queue system** com Redis (Upstash)
- **Circuit breaker** para proteção contra falhas
- **Exponential backoff** com jitter decorrelacionado
- **Worker dedicado** para processamento contínuo

### Capacidade

| Tier | Limite/24h | MPS | Mensagens/Hora |
|------|-----------|-----|----------------|
| Tier 1 | 2.000 | 40 | 144.000 |
| Tier 2 | 10.000 | 60 | 216.000 |
| Tier 3 | 100.000 | 80 | 288.000 |
| Unlimited | ∞ | 1.000 | 3.600.000 |

---

## 🛠️ Setup

### 1. Variáveis de Ambiente

Adicione ao `.env.local`:

```bash
# Supabase (já existentes)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=xxx

# Upstash Redis (NOVO - necessário para alta escala)
UPSTASH_REDIS_REST_URL=https://xxx.upstash.io
UPSTASH_REDIS_REST_TOKEN=xxx

# WhatsApp
WHATSAPP_VERIFY_TOKEN=seu-token-verificacao
```

### 2. Criar Conta Upstash

1. Acesse [upstash.com](https://upstash.com)
2. Crie um novo database Redis
3. Copie `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`

### 3. Aplicar Migrations

Execute no Supabase SQL Editor:

```bash
# Na ordem:
1. supabase/campaigns-schema.sql (se não executado)
2. supabase/campaigns-high-scale.sql
```

---

## 🏃 Executando

### Modo Desenvolvimento

```bash
# Terminal 1 - Next.js App
npm run dev

# Terminal 2 - Worker (se quiser processamento local)
cd worker
npm install
npm run dev
```

### Modo Produção

O worker deve rodar em um serviço separado (Railway/Render):

```bash
# Build
cd worker
npm run build

# Start
npm start
```

---

## 🚂 Deploy do Worker (Railway)

### Opção 1: Via railway.json

Crie `railway.json` na raiz do worker:

```json
{
  "build": {
    "builder": "DOCKERFILE"
  },
  "deploy": {
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
```

### Opção 2: Via CLI

```bash
# Instalar Railway CLI
npm install -g @railway/cli

# Login
railway login

# Criar projeto
railway init

# Deploy
railway up
```

### Variáveis no Railway

Configure as mesmas variáveis do `.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `NODE_ENV=production`

---

## 📊 Monitoramento

### API de Stats

```bash
# Estatísticas das filas
GET /api/whatsapp/queue/stats

# Com stats de instância específica
GET /api/whatsapp/queue/stats?instanceId=xxx

# Ações na fila
POST /api/whatsapp/queue/stats
{
  "action": "retry_dlq" | "clear" | "recover_stuck",
  "queue": "campaigns" | "webhooks",
  "jobId": "opcional"
}
```

### Health Check do Worker

O worker loga a cada 30s:
```
💓 Health Check [1h 30m 45s]:
   Queue: 150 pending, 5 processing, 0 DLQ
   Memory: 45MB / 128MB
```

---

## 🔧 Configuração

### Rate Limiting

Edite `src/config/whatsapp.ts`:

```typescript
export const WHATSAPP_CONFIG = {
  targetMPS: 70,              // Ajuste conforme seu tier
  burstCapacity: 100,
  pairRatePerMinute: 10,      // Limite da Meta
  // ...
}
```

### Tiers

O sistema detecta automaticamente o tier da instância. Para definir manualmente:

```sql
UPDATE whatsapp_instances 
SET messaging_tier = 3 
WHERE id = 'xxx';
```

---

## 🔄 Fluxo de Campanha

```
1. Criar Campanha (API/UI)
   ↓
2. Iniciar Envio (POST /api/whatsapp/campaigns/[id]/send)
   ↓
3. Campaign Processor divide em batches
   ↓
4. Batches entram na Queue (Redis)
   ↓
5. Worker processa batches
   ↓
6. Rate Limiter controla throughput
   ↓
7. Circuit Breaker protege contra falhas
   ↓
8. Webhook atualiza status (delivered/read)
   ↓
9. Métricas atualizadas em tempo real
```

---

## 🐛 Troubleshooting

### "Redis credentials not configured"

Verifique as variáveis `UPSTASH_REDIS_REST_URL` e `UPSTASH_REDIS_REST_TOKEN`.

### Jobs ficando stuck

```bash
# Via API
POST /api/whatsapp/queue/stats
{ "action": "recover_stuck" }

# O worker também recupera automaticamente a cada 1 min
```

### Rate limit errors

O sistema automaticamente:
1. Faz retry com backoff exponencial
2. Ativa throttle após muitos erros
3. Circuit breaker abre se falhas persistem

### Campanha não completa

Verifique:
1. Worker está rodando
2. Redis está conectado
3. Status da campanha é "running"

```sql
-- Ver campanhas running
SELECT id, name, status, total_recipients, total_sent 
FROM whatsapp_campaigns 
WHERE status = 'running';

-- Ver recipients pendentes
SELECT COUNT(*) 
FROM whatsapp_campaign_recipients 
WHERE campaign_id = 'xxx' AND status = 'pending';
```

---

## 📁 Estrutura de Arquivos

```
src/
├── config/
│   └── whatsapp.ts          # Configurações
├── lib/whatsapp/
│   ├── rate-limiter.ts      # Rate limiting por tier
│   ├── circuit-breaker.ts   # Proteção contra falhas
│   ├── queue.ts             # Sistema de filas
│   ├── backoff.ts           # Exponential backoff
│   ├── campaign-processor.ts # Processador de campanhas
│   └── meta-api.ts          # Integração Meta API
└── app/api/whatsapp/
    ├── campaigns/
    │   └── [id]/send/       # Endpoint de envio
    ├── queue/stats/         # Monitoramento
    └── webhook/             # Webhooks Meta

worker/
├── campaign-worker.ts       # Worker standalone
├── package.json
├── tsconfig.json
└── Dockerfile

supabase/
├── campaigns-schema.sql     # Schema base
└── campaigns-high-scale.sql # Funções de alta escala
```

---

## 📈 Próximas Melhorias

- [ ] Dashboard de métricas em tempo real
- [ ] Alertas via Slack/Discord
- [ ] A/B testing de templates
- [ ] Scheduling avançado
- [ ] Retry automático de falhos

---

## 🆘 Suporte

Para issues, verifique:
1. Logs do worker
2. Stats da queue (`/api/whatsapp/queue/stats`)
3. Métricas de campanha no Supabase
