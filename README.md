# Shopify Integration - Pacote Completo

## 🎯 O que está incluído

### 1. ✅ Correções de Schema
- `contact-sync.ts` → usa `first_name`, `last_name`, `shopify_customer_id`, `custom_fields`
- `deal-sync.ts` → usa `custom_fields`, busca `full_name` do contato

### 2. ✅ Correção de URL do Webhook
- Agora aponta para `/api/webhooks/shopify` (URL correta)

### 3. ✅ Enriquecimento de Dados
- RFM scores e segmentação automática
- Produtos favoritos
- Última compra com itens

### 4. 🆕 Histórico de Compras
- Todos os pedidos do cliente
- Itens de cada pedido com imagem, quantidade e preço

### 5. 🆕 Histórico de Navegação (Pixel)
- Páginas visitadas no site
- Produtos visualizados
- Carrinho abandonado
- UTM tracking

---

## 📁 Arquivos Incluídos

```
deploy-complete/
├── src/
│   ├── lib/services/shopify/
│   │   ├── contact-sync.ts      ← Corrigido
│   │   ├── deal-sync.ts         ← Corrigido
│   │   ├── activity-tracker.ts  ← Novo
│   │   └── index.ts
│   │
│   ├── app/api/
│   │   ├── shopify/
│   │   │   ├── connect/route.ts
│   │   │   ├── webhooks/register/route.ts
│   │   │   ├── track/route.ts   ← 🆕 Pixel de tracking
│   │   │   └── pixel/route.ts   ← 🆕 Gerenciar pixel
│   │   │
│   │   ├── webhooks/shopify/route.ts
│   │   │
│   │   └── contacts/[id]/timeline/route.ts
│   │
│   ├── components/crm/
│   │   └── ContactDrawer.tsx    ← Atualizado com histórico
│   │
│   └── types/index.ts
│
└── supabase/migrations/
    └── shopify-enrichment.sql
```

---

## 🚀 Deploy em 5 Passos

### Passo 1: Executar Migration
```sql
-- No Supabase SQL Editor, execute o arquivo:
-- supabase/migrations/shopify-enrichment.sql
```

### Passo 2: Copiar Arquivos
```bash
cp -r deploy-complete/src/* /seu-projeto/src/
```

### Passo 3: Deploy
```bash
git add .
git commit -m "feat: Shopify complete integration with tracking"
git push
```

### Passo 4: Re-registrar Webhooks
```bash
curl -X POST https://seusite.com/api/shopify/webhooks/register \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "seu-org-id"}'
```

### Passo 5: Instalar Pixel de Tracking
```bash
curl -X POST https://seusite.com/api/shopify/pixel \
  -H "Content-Type: application/json" \
  -d '{"organizationId": "seu-org-id"}'
```

---

## 📊 Como o Pixel Funciona

### Instalação Automática
Quando você chama `POST /api/shopify/pixel`, o sistema:
1. Conecta na API do Shopify
2. Cria um Script Tag que carrega automaticamente em todas as páginas da loja
3. O script rastreia automaticamente:
   - Page views
   - Visualização de produtos
   - Add to cart
   - Início do checkout
   - Email capturado

### Eventos Capturados

| Evento | Descrição |
|--------|-----------|
| `page_view` | Visitou qualquer página |
| `product_view` | Visualizou página de produto |
| `add_to_cart` | Clicou em adicionar ao carrinho |
| `checkout_started` | Entrou no checkout |
| `email_captured` | Preencheu email (checkout) |

### Dados Capturados por Sessão
- Páginas visitadas (URL, título, tipo)
- Produtos visualizados (ID, título, preço)
- UTM parameters (source, medium, campaign)
- Referrer (de onde veio)
- Duração da sessão

---

## 🖥️ O que Aparece na UI

### ContactDrawer Completo:

```
┌──────────────────────────────────────────┐
│  👤 João Silva                           │
│  joao@email.com | +55 11 99999-9999      │
├──────────────────────────────────────────┤
│  🏆 CAMPEÃO      [R:5] [F:4] [M:5]      │
│  Última compra: 3 dias atrás             │
├──────────────────────────────────────────┤
│  📦 Última Compra #1234        R$ 450   │  ← Expansível
│  ├ 📷 Camiseta Vintage (2x)    R$ 180   │
│  └ 📷 Calça Jeans (1x)         R$ 170   │
├──────────────────────────────────────────┤
│  ❤️ Produtos Favoritos (5)              │  ← Expansível
│  #1 Camiseta Básica - 8x comprado        │
│  #2 Tênis Runner - 3x comprado           │
├──────────────────────────────────────────┤
│  🛒 Histórico de Compras (12 pedidos)   │  ← 🆕 Expansível
│  ┌─ Pedido #1234 - 20/12/2024  R$ 450 ─┐│
│  │ 📷 Camiseta Vintage (2x)            ││
│  │ 📷 Calça Jeans (1x)                 ││
│  └─────────────────────────────────────┘│
│  ┌─ Pedido #1233 - 15/12/2024  R$ 280 ─┐│
│  │ 📷 Tênis Runner (1x)                ││
│  └─────────────────────────────────────┘│
├──────────────────────────────────────────┤
│  👁️ Navegação no Site (45 páginas)     │  ← 🆕 Expansível
│  ┌─ Produtos Visualizados ─────────────┐│
│  │ Jaqueta Couro - 26/12 às 14:30      ││
│  │ Bolsa Premium - 26/12 às 14:28      ││
│  └─────────────────────────────────────┘│
│  ┌─ Sessões Recentes ──────────────────┐│
│  │ 26/12/2024 às 14:25 - 8 páginas     ││
│  │ [google / cpc] Viu: Jaqueta, Bolsa  ││
│  └─────────────────────────────────────┘│
├──────────────────────────────────────────┤
│  📋 Atividades                           │
│  📦 Fez pedido #1234          [Shopify] │
│  👁️ Visualizou: Jaqueta Couro [Pixel]  │
│  🛒 Adicionou ao carrinho     [Pixel]   │
│  💳 Pagamento confirmado      [Shopify] │
└──────────────────────────────────────────┘
```

---

## 🔧 APIs Disponíveis

### Pixel de Tracking

```bash
# Instalar pixel na loja
POST /api/shopify/pixel
Body: { "organizationId": "xxx" }

# Verificar status do pixel
GET /api/shopify/pixel?organizationId=xxx

# Remover pixel
DELETE /api/shopify/pixel
Body: { "organizationId": "xxx" }
```

### Timeline do Contato

```bash
# Buscar timeline completa
GET /api/contacts/{id}/timeline?limit=30

# Resposta inclui:
{
  "contact": { ... },           // Dados enriquecidos
  "activities": [ ... ],        // Atividades
  "orders": [ ... ],            // Histórico de pedidos
  "sessions": [ ... ],          // Sessões de navegação
  "purchases": [ ... ]          // Produtos comprados
}
```

---

## ⚠️ Permissões Necessárias no Shopify

Para o pixel funcionar, seu app Shopify precisa ter:

- `read_script_tags` - Para listar scripts
- `write_script_tags` - Para instalar o pixel

Se não tiver, adicione no Partner Dashboard do Shopify.

---

## 🔄 Fluxo de Dados

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Shopify   │───>│   Webhook    │───>│  Supabase   │
│    Loja     │    │   Handler    │    │  contacts   │
└─────────────┘    └──────────────┘    │  purchases  │
                                       │  activities │
┌─────────────┐    ┌──────────────┐    └─────────────┘
│   Cliente   │───>│    Pixel     │───>│  sessions   │
│  Navegando  │    │   Script     │    │  activities │
└─────────────┘    └──────────────┘    └─────────────┘
```

1. **Webhook**: Quando cliente faz pedido, Shopify envia webhook
2. **Pixel**: Quando cliente navega, pixel envia eventos em tempo real
3. **Timeline API**: Junta tudo para mostrar no ContactDrawer

---

## 📞 Troubleshooting

### Pixel não está rastreando
1. Verifique se foi instalado: `GET /api/shopify/pixel?organizationId=xxx`
2. Verifique no Shopify Admin → Settings → Apps → Script tags
3. Abra o console do navegador na loja e procure por `[WorderTrack]`

### Histórico de compras vazio
1. Verifique se a migration foi executada
2. Verifique se novos pedidos estão chegando via webhook
3. Para pedidos antigos, execute uma importação

### Contatos sem dados enriquecidos
1. Os dados são calculados quando chegam novos pedidos
2. Para calcular RFM de todos: `SELECT calculate_contact_rfm('org-id')`
