# 🔒 Sprint 2 - Segurança e Privacidade

## ⚠️ PROBLEMA CRÍTICO

A chave da Evolution API está **hardcoded em 9 arquivos**:

```
429683C4C977415CAAFCCE10F7D57E11
```

Qualquer pessoa com acesso ao código pode ver essa chave!

---

## ✅ Correções Neste Pacote

### Arquivos para Substituir

| Arquivo | Correções |
|---------|-----------|
| `src/app/api/whatsapp/inbox/conversations/[id]/messages/route.ts` | Sem hardcode + paginação real |
| `src/app/api/whatsapp/inbox/conversations/[id]/media/route.ts` | Sem hardcode + Signed URLs + validações |

### Arquivos que Precisam de Patch Manual

Execute o `patch-security.sh` ou faça manualmente:

```typescript
// ❌ REMOVER o fallback (|| 'chave')
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY || '429683C4C977415CAAFCCE10F7D57E11';
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL || 'https://n8n-evolution-api.1fpac5.easypanel.host';

// ✅ DEIXAR ASSIM
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_API_URL = process.env.EVOLUTION_API_URL;
```

**Arquivos para patch:**
- `src/app/api/whatsapp/instances/route.ts`
- `src/app/api/whatsapp/evolution/webhook/route.ts`
- `src/app/api/whatsapp/media/route.ts`
- `src/app/api/whatsapp/inbox/contacts/[id]/profile-picture/route.ts`
- `src/app/api/whatsapp/webhook/route.ts` (linha 313)
- `src/app/api/whatsapp/fix-webhook/route.ts`
- `src/app/api/whatsapp/debug/route.ts`

---

## 🚀 Deploy

### 1. Verificar env vars no Vercel

```
Settings → Environment Variables

EVOLUTION_API_URL = https://n8n-evolution-api.1fpac5.easypanel.host
EVOLUTION_API_KEY = sua_chave_aqui
```

### 2. Substituir arquivos

```bash
# Copiar arquivos deste pacote
cp -r src/* /caminho/projeto/src/
```

### 3. Rodar script de patch

```bash
# Na raiz do projeto
bash patch-security.sh
```

### 4. Verificar

```bash
# Deve retornar VAZIO
grep -rn "429683C4C977415" src/
```

### 5. Commit e push

```bash
git add .
git commit -m "security: remove hardcoded API keys, add signed URLs"
git push
```

---

## 📊 O Que Mudou

### 🔐 Segurança
- Sem chaves hardcoded no código
- Erro 503 claro se API não configurada

### 📎 Upload de Mídia
- Validação de tamanho (max 16MB)
- Validação de tipos MIME
- Bloqueio de extensões perigosas (.exe, .bat, etc)

### 🔗 Signed URLs
- URLs de mídia expiram em 1 hora
- Novo endpoint GET para refresh de URL
- Campo `media_storage_path` para regenerar URLs

---

## 🗄️ Migration (opcional)

Se quiser salvar o path do storage para regenerar URLs:

```sql
ALTER TABLE whatsapp_messages 
ADD COLUMN IF NOT EXISTS media_storage_path TEXT;
```

---

## 🧪 Testes

1. **Build não contém chave:**
```bash
grep -r "429683C4C977415" .next/ || echo "✅ OK"
```

2. **Enviar mídia funciona:**
- Enviar imagem
- Verificar URL tem `?token=` (Signed URL)

3. **Validações funcionam:**
- Tentar enviar arquivo > 16MB → erro
- Tentar enviar .exe → erro

4. **Erro sem config:**
- Remover env vars
- Tentar enviar → erro 503 claro
