# 🔴 CORREÇÃO CRÍTICA: Vazamento de Dados Entre Organizações

## O Problema

Os webhooks do WhatsApp tinham **fallbacks perigosos** que buscavam QUALQUER instância do banco quando não encontravam a instância pelo nome exato:

```typescript
// ❌ CÓDIGO PERIGOSO (ANTIGO)
if (!instance) {
  // Busca QUALQUER instância conectada - de QUALQUER organização!
  const { data: anyInstance } = await supabase
    .from('whatsapp_instances')
    .select('*')
    .eq('status', 'connected')
    .limit(1)  // 🔴 Pega a primeira que encontrar!
}
```

### Consequências:
- Mensagens da Loja A apareciam na Loja B
- Contatos criados na organização errada
- Conversas misturadas entre clientes diferentes
- **Violação de privacidade e LGPD**

## A Correção

Removemos TODOS os fallbacks perigosos. Agora, se uma instância não for encontrada pelo nome exato, a mensagem é **descartada** com log de erro:

```typescript
// ✅ CÓDIGO SEGURO (NOVO)
if (!instance) {
  console.error('[Webhook] ❌ Instance not found:', instanceName);
  console.error('[Webhook] ❌ This event will be DROPPED to prevent data leakage');
  return;  // ✅ Não processa - previne vazamento!
}
```

## Arquivos Corrigidos

```
src/app/api/whatsapp/webhook/route.ts           # Webhook principal
src/app/api/whatsapp/evolution/webhook/route.ts  # Webhook Evolution
```

## Como Aplicar

1. **Substitua** os arquivos pelos novos
2. **Verifique** se todas as instâncias no banco têm `unique_id` correto
3. **Teste** enviando mensagem de teste para cada WhatsApp

## Verificação de Instâncias

Execute no Supabase SQL Editor:

```sql
-- Ver todas as instâncias e suas organizações
SELECT 
  id,
  organization_id,
  unique_id,
  instance_name,
  phone_number,
  status
FROM whatsapp_instances
ORDER BY organization_id;
```

Cada instância deve ter `unique_id` que corresponde ao nome na Evolution API.

## Dicas de Debug

Se mensagens não estão chegando após a correção:

1. Verifique os logs do Vercel para ver qual `instanceName` está chegando
2. Compare com o `unique_id` no banco
3. Se diferentes, atualize o banco:

```sql
UPDATE whatsapp_instances 
SET unique_id = 'nome_correto_da_evolution_api'
WHERE id = 'uuid-da-instancia';
```

## Impacto

| Antes | Depois |
|-------|--------|
| Mensagens podiam ir para org errada | Mensagens vão APENAS para org correta |
| Fallback buscava qualquer instância | Sem fallback - instância deve existir |
| Contatos criados em org errada | Contatos sempre na org da instância |
| Conversas misturadas | Conversas isoladas por organização |
