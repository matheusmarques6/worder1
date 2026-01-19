# 🔧 Correção WhatsApp Inbox - COMPLETA

## ✅ Problemas Corrigidos

| Prioridade | Problema | Status |
|------------|----------|--------|
| **P0** | Realtime desconectado do estado da UI | ✅ Corrigido |
| **P0** | Paginação fake (API ignorava limit/before) | ✅ Corrigido |
| **P0** | Chave de API hardcoded no código (SEGURANÇA!) | ✅ Corrigido |
| **P1** | Botão de anexo não funciona | ✅ Corrigido |
| **P1** | Hook sem sendMedia | ✅ Corrigido |
| **P2** | Status de mensagem não atualiza na UI | ✅ Corrigido |
| **P2** | Sem fallback quando realtime cai | ✅ Corrigido (polling 5s) |
| **P2** | Stale state no realtime | ✅ Corrigido |

---

## 📁 Arquivos para Substituir

```
src/
├── hooks/
│   ├── useInboxMessages.ts       ← SUBSTITUIR (sendMedia + paginação)
│   └── useWhatsAppRealtime.ts    ← SUBSTITUIR (sem store, apenas callbacks)
├── components/
│   └── whatsapp/
│       └── inbox/
│           └── ChatPanel.tsx     ← SUBSTITUIR (upload de mídia completo)
└── app/
    ├── (dashboard)/
    │   └── whatsapp/
    │       └── inbox/
    │           └── page.tsx      ← SUBSTITUIR (polling + status updates)
    └── api/
        └── whatsapp/
            └── inbox/
                └── conversations/
                    └── [id]/
                        ├── messages/
                        │   └── route.ts  ← SUBSTITUIR (paginação real)
                        └── media/
                            └── route.ts  ← SUBSTITUIR (sem chave hardcoded)
```

---

## 🚀 Instruções de Deploy

### 1. Instalar dependência
```bash
npm install @supabase/ssr
# ou
pnpm add @supabase/ssr
```

### 2. Verificar variáveis de ambiente
```bash
# .env.local DEVE ter (SEM fallback hardcoded!)
EVOLUTION_API_URL=https://sua-evolution-api.com
EVOLUTION_API_KEY=sua_chave_secreta_aqui
```

### 3. Backup dos arquivos originais
```bash
cp src/hooks/useInboxMessages.ts src/hooks/useInboxMessages.ts.bak
cp src/hooks/useWhatsAppRealtime.ts src/hooks/useWhatsAppRealtime.ts.bak
# ... etc
```

### 4. Substituir arquivos
Copie os arquivos deste pacote para suas respectivas pastas no projeto.

### 5. Testar localmente
```bash
npm run dev
```

### 6. Deploy
```bash
git add .
git commit -m "fix: WhatsApp inbox - realtime, media upload, pagination, security"
git push
```

---

## 🧪 Checklist de Teste

- [ ] Abrir conversa → mensagens carregam
- [ ] Receber mensagem → aparece em tempo real OU via polling
- [ ] Enviar texto → mensagem aparece com status ✓
- [ ] Enviar imagem → preview → upload → aparece no chat
- [ ] Enviar documento → preview → upload → aparece no chat
- [ ] Status atualiza → sent → delivered → read (✓✓ azul)
- [ ] Scroll para cima → carrega mensagens antigas (paginação)
- [ ] Indicador de conexão → mostra "Live" ou "Polling"
- [ ] Sem chave hardcoded → verificar build não contém chave

---

## 🔒 Verificação de Segurança

Após deploy, verificar que a chave da API NÃO aparece no código:

```bash
# Buscar por chaves hardcoded no build
grep -r "429683C4C977415" .next/ || echo "✅ Nenhuma chave hardcoded encontrada"
```

---

## ⚠️ Pendências para Sprint 2

1. **Storage privado + Signed URL** - URLs de mídia ainda são públicas
2. **Rate limit no upload** - Não implementado
3. **Validação mais rígida de MIME types**

---

## 📊 O que mudou em cada arquivo

### useInboxMessages.ts
- ✅ Adicionado `sendMedia()` para upload de arquivos
- ✅ Paginação com cursores (`before`/`after`)
- ✅ `refetchLatest()` para polling de novas mensagens
- ✅ `isUploading` state

### useWhatsAppRealtime.ts
- ✅ Usa `createBrowserClient` do `@supabase/ssr` (com sessão)
- ✅ Não manipula store diretamente (apenas callbacks)
- ✅ `onStatusUpdate` callback para status de mensagem

### ChatPanel.tsx
- ✅ Menu de anexo (Imagem/Vídeo/Documento)
- ✅ Input file com ref
- ✅ Modal de preview antes de enviar
- ✅ Campo de caption
- ✅ Validação de tamanho (16MB)

### inbox/page.tsx
- ✅ Conecta `onStatusUpdate` ao hook
- ✅ Polling fallback quando realtime desconectado
- ✅ Indicador visual de conexão (Live/Polling)
- ✅ Handler `handleSendMedia`

### messages/route.ts (API)
- ✅ Paginação real com `limit + 1` para `hasMore`
- ✅ Filtros `before`/`after` funcionando
- ✅ Sem chave hardcoded (falha com erro claro)

### media/route.ts (API)
- ✅ Sem chave hardcoded
- ✅ Validação de tamanho (16MB)
- ✅ Validação de MIME types
