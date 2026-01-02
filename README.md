# 🔧 Arquivos Modificados - Migração RLS

## O que foi feito
- Corrigido erro de build (createClient no module level)
- Implementado lazy loading para Supabase clients
- Adicionado getAuthClient() para uso futuro com RLS

## Como aplicar

### Opção 1: Copiar pasta src
```bash
# Na raiz do seu projeto
cp -r arquivos-modificados/src/* src/
npm install
npm run build
```

### Opção 2: Copiar manualmente
Copie cada arquivo para a localização correspondente no seu projeto.

## Arquivos incluídos

### Novos (criar)
- `src/lib/supabase-admin.ts` - Cliente SERVICE_ROLE lazy
- `src/lib/supabase-client.ts` - Cliente ANON_KEY lazy
- `src/lib/api-utils.ts` - Atualizado com getAuthClient()

### Modificados
- `src/hooks/` - 3 arquivos
- `src/lib/ai/` - 2 arquivos  
- `src/lib/whatsapp/` - 2 arquivos
- `src/lib/services/` - 9 arquivos
- `src/app/api/` - ~98 arquivos

## Verificação
Após copiar, execute:
```bash
npm run build
```

O build deve passar sem erros.

## SQL (já executado)
O RLS já foi habilitado no banco via SQL Editor.
Não precisa fazer nada no Supabase.
