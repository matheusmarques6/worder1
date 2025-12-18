# WORDER - Sistema de Agentes V2

## 🎯 O que mudou nesta versão

Agentes agora usam o **mesmo layout** do site, mas com itens de menu filtrados.

### Para Agentes:
- Veem apenas "Inbox" no menu principal
- Não veem: Dashboard, CRM, WhatsApp, Automações, Integrações
- Não veem: Analytics (Shopify, Facebook Ads, etc)
- Não veem: Sistema (Configurações, Ajuda)
- Não veem: Seletor de Lojas

### Para Owners/Admins:
- Veem todos os itens de menu
- Não veem "Inbox" (usam o WhatsApp direto)

## 🔧 Instalação

1. Execute `worder-fix-enum.sql` no Supabase SQL Editor
2. Extraia os arquivos:
   ```bash
   unzip worder-fase3-v2.zip
   cp -r worder-fase3-v2/src/* src/
   ```
3. Reinicie: `npm run dev`

## 📁 Arquivos Principais

- `src/app/(dashboard)/layout.tsx` - Layout com menu filtrado por role
- `src/app/(dashboard)/inbox/page.tsx` - Página de inbox (agentes)
- `src/middleware.ts` - Proteção de rotas
