# ZAP ZAP 06 - Correções de Webhook e Mensagens

## Problema Identificado
O WhatsApp estava conectando (mostrando "Online") mas não recebia nem enviava mensagens porque:
1. O webhook pode não estar configurado corretamente na Evolution API
2. Os eventos não estavam sendo processados corretamente
3. Falta de logs para diagnóstico

## Correções Implementadas

### 1. Webhook Melhorado (`/api/whatsapp/webhook/route.ts`)
- Adicionado logs detalhados para cada evento recebido
- Suporte a múltiplos formatos de evento (messages.upsert, message, messages_upsert)
- Processamento de eventos de conexão e QR Code
- Busca mais robusta de instâncias (tenta múltiplas formas)
- Melhor extração de conteúdo de mensagens

### 2. Nova API de Fix (`/api/whatsapp/fix-webhook/route.ts`)
- Verifica e corrige automaticamente a configuração do webhook em todas as instâncias
- Sincroniza status entre Evolution API e banco de dados
- Permite enviar mensagem de teste

### 3. Envio de Mensagens Melhorado (`/api/whatsapp/inbox/conversations/[id]/messages/route.ts`)
- Logs detalhados em cada etapa
- Busca instâncias por múltiplos status (connected, ACTIVE)
- Retorna informações de debug quando falha
- Salva mensagem mesmo se falhar (para histórico)

---

## Como Usar

### Passo 1: Verificar e Corrigir Webhooks
Acesse no navegador:
```
https://seu-dominio.vercel.app/api/whatsapp/fix-webhook?organizationId=SEU_ORG_ID
```

Ou sem filtro (todas as instâncias):
```
https://seu-dominio.vercel.app/api/whatsapp/fix-webhook
```

**O que essa API faz:**
1. Lista todas as instâncias Evolution no banco
2. Para cada instância:
   - Verifica status na Evolution API
   - Verifica configuração atual do webhook
   - Reconfigura webhook se necessário (URL correta + eventos)
   - Atualiza status no banco de dados
3. Retorna resumo das operações

### Passo 2: Enviar Mensagem de Teste
POST para `/api/whatsapp/fix-webhook`:
```json
{
  "instanceId": "UUID-DA-INSTANCIA",
  "phoneNumber": "5538999999999",
  "message": "Teste de mensagem"
}
```

### Passo 3: Verificar Logs
Após executar o fix, verifique os logs no Vercel:
1. Vá em **Vercel Dashboard** > **seu projeto** > **Deployments**
2. Clique no deployment ativo
3. Vá em **Logs** (tempo real)
4. Envie uma mensagem para o WhatsApp conectado
5. Observe se aparece `[Webhook] ======================================`

---

## Diagnóstico Completo

### API de Debug Existente
```
GET /api/whatsapp/debug?action=full
```

Retorna:
- Status da Evolution API
- Lista de instâncias na Evolution
- Lista de instâncias no banco
- Comparação de status

### Verificar Webhook de Instância Específica
```
GET /api/whatsapp/debug?action=webhook&instance=NOME_DA_INSTANCIA
```

### Corrigir Todos os Webhooks
```
POST /api/whatsapp/debug
{
  "action": "fix_webhooks"
}
```

---

## Checklist de Verificação

- [ ] Evolution API está acessível (`/api/whatsapp/debug?action=status`)
- [ ] Instância existe na Evolution (`/api/whatsapp/debug?action=instances`)
- [ ] Instância existe no banco com status `connected`
- [ ] Webhook está configurado com URL correta (`/api/whatsapp/fix-webhook`)
- [ ] Logs mostram eventos chegando no webhook
- [ ] Mensagens estão sendo salvas no banco (`whatsapp_messages`)
- [ ] Conversas estão sendo atualizadas (`whatsapp_conversations`)

---

## Arquivos Modificados

1. `/src/app/api/whatsapp/webhook/route.ts` - Webhook principal melhorado
2. `/src/app/api/whatsapp/fix-webhook/route.ts` - **NOVO** - API de correção automática
3. `/src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts` - Envio de mensagens melhorado

---

## Próximos Passos Recomendados

1. Fazer deploy das alterações no Vercel
2. Executar `/api/whatsapp/fix-webhook` para reconfigurar webhooks
3. Testar enviando uma mensagem para o WhatsApp
4. Verificar logs em tempo real no Vercel
5. Se ainda não funcionar, verificar se a URL do Vercel está correta na variável `NEXT_PUBLIC_APP_URL`
