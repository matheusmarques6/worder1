# Automação Real - B1 + B2 Package

## O que está incluído

### B1: Execução Real de Automações

1. **`supabase/automation-triggers.sql`** 
   - Tabelas: `automation_queue`, `automation_runs`, `automation_run_steps`, `scheduled_automation_jobs`
   - Triggers SQL que detectam mudanças em deals, contatos e tags
   - Função que enfileira eventos para processamento

2. **`src/app/api/webhooks/process-queue/route.ts`**
   - API que processa a fila de automações
   - Executa cada nó da automação em ordem
   - Salva histórico de execução

3. **`src/lib/automation/actions/index.ts`**
   - Executor de ações reais (adicionar tag, atualizar contato, etc)
   - Integração preparada para Klaviyo, WhatsApp, Twilio

### B2: Aba de Execuções

4. **`src/components/automation/ExecutionHistory.tsx`**
   - Lista todas as execuções com filtros (status, data)
   - Auto-refresh a cada 10 segundos
   - Paginação

5. **`src/components/automation/ExecutionDetail.tsx`**
   - Detalhes de cada execução
   - Mostra contexto (contato, deal, trigger)
   - Lista todos os steps com input/output expandível

6. **`src/app/(dashboard)/automations/page.tsx`**
   - Tabs: [Automações] [Execuções]
   - Integração do ExecutionHistory

---

## Instruções de Configuração

### Passo 1: Executar SQL no Supabase

1. Vá para o Supabase Dashboard
2. Clique em **SQL Editor**
3. Cole o conteúdo de `supabase/automation-triggers.sql`
4. Execute

Isso criará:
- 4 novas tabelas
- Triggers automáticos
- Funções auxiliares

### Passo 2: Fazer Deploy no Vercel

1. Extraia o ZIP
2. Copie os arquivos para o repositório
3. Faça commit e push
4. Aguarde o deploy

### Passo 3: Configurar Cron para Processar Fila

Para que as automações rodem automaticamente, você precisa chamar a API `/api/webhooks/process-queue` periodicamente.

**Opção A: Vercel Cron**

Crie o arquivo `vercel.json`:
```json
{
  "crons": [{
    "path": "/api/webhooks/process-queue",
    "schedule": "* * * * *"
  }]
}
```

**Opção B: Serviço externo (Upstash, EasyCron)**

Configure para chamar:
```
POST https://seu-site.com/api/webhooks/process-queue
Body: { "limit": 10 }
```
A cada 1 minuto.

### Passo 4: (Opcional) API Key de Segurança

Para proteger o endpoint de processamento:

1. Adicione no `.env`:
```
INTERNAL_API_KEY=sua-chave-secreta-aqui
```

2. Nas chamadas do cron, adicione o header:
```
Authorization: Bearer sua-chave-secreta-aqui
```

---

## Como Funciona

### Fluxo de Execução

```
1. Usuário muda deal no CRM
         ↓
2. Trigger SQL detecta mudança
         ↓
3. INSERT em automation_queue
         ↓
4. Cron chama /api/webhooks/process-queue
         ↓
5. Busca automações ativas com trigger_type = 'deal_stage'
         ↓
6. Para cada automação:
   - Cria registro em automation_runs
   - Executa cada nó em ordem
   - Salva output de cada step
   - Atualiza status final
         ↓
7. Usuário vê na aba Execuções
```

### Triggers Implementados

| Trigger | Quando dispara |
|---------|----------------|
| `deal_created` | INSERT em deals |
| `deal_stage` | UPDATE em deals (stage_id mudou) |
| `deal_won` | UPDATE em deals (status = 'won') |
| `deal_lost` | UPDATE em deals (status = 'lost') |
| `signup` | INSERT em contacts |
| `tag` | INSERT em contact_tags |

### Ações Implementadas

| Ação | O que faz |
|------|-----------|
| `action_tag` | Adiciona tag ao contato |
| `action_update` | Atualiza campos do contato |
| `action_email` | Envia email (via integração) |
| `action_whatsapp` | Envia WhatsApp (via integração) |
| `action_sms` | Envia SMS (via integração) |
| `action_create_deal` | Cria novo deal |
| `action_move_deal` | Move deal de estágio |
| `action_notify` | Cria notificação interna |
| `action_webhook` | Chama URL externa |

---

## Próximos Passos (Fase C)

- [ ] Registro de webhooks na Shopify ao ativar automação
- [ ] Trigger de carrinho abandonado (Shopify)
- [ ] Trigger de pedido realizado (Shopify)
- [ ] Integração real com Klaviyo para envio de emails
- [ ] Integração real com WhatsApp Business API
