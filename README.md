# CORREÇÃO SIMPLES - Apenas Webhook

Este pacote contém APENAS a correção para evitar duplicação de conversas.

## O que faz:
- Busca conversa por `phone_number` (não por contact_id)
- Só cria nova conversa se não existir nenhuma para esse número
- Atualiza conversa existente em vez de criar nova

## Instalação:

### 1. Execute o SQL no Supabase (limpar-duplicados.sql)
Isso vai remover as conversas e contatos duplicados.

### 2. Substitua o arquivo
Copie `webhook-route.ts` para:
`src/app/api/whatsapp/webhook/route.ts`

### 3. Deploy
```bash
git add .
git commit -m "fix: webhook sem duplicação"
git push
```

## Não mexe em mais nada!
NÃO substitua o InboxTab.tsx - deixe o seu atual.
