# Meta Ads Integration - Worder

## 📁 Estrutura de Arquivos

Todos os arquivos estão dentro de `src/` - basta copiar a pasta `src` para seu projeto.

```
meta-ads-export/
└── src/
    ├── lib/
    │   ├── meta-api.ts              # Cliente Graph API (NOVO)
    │   └── oauth-security.ts        # OAuth utils (SUBSTITUIR)
    │
    ├── app/
    │   ├── api/
    │   │   ├── meta/
    │   │   │   ├── accounts/route.ts    # GET, DELETE, PATCH
    │   │   │   ├── campaigns/route.ts   # GET (real-time)
    │   │   │   ├── adsets/route.ts      # GET (real-time)
    │   │   │   ├── ads/route.ts         # GET (real-time)
    │   │   │   ├── insights/route.ts    # GET (KPIs)
    │   │   │   └── sync/route.ts        # POST
    │   │   ├── ads/
    │   │   │   └── status/route.ts      # PATCH (toggle)
    │   │   └── integrations/
    │   │       └── meta/
    │   │           ├── route.ts         # (SUBSTITUIR)
    │   │           └── callback/route.ts # (SUBSTITUIR)
    │   │
    │   └── (dashboard)/
    │       └── analytics/
    │           └── facebook/
    │               └── page.tsx         # (SUBSTITUIR)
    │
    ├── types/
    │   └── facebook.ts              # Types (SUBSTITUIR)
    │
    ├── hooks/
    │   ├── useFacebookAds.ts        # Hook principal (SUBSTITUIR)
    │   └── useStore.ts              # Hook de lojas (NOVO)
    │
    ├── utils/
    │   └── ads-formatting.ts        # Formatadores (NOVO)
    │
    └── components/
        └── ads/
            ├── index.ts
            ├── KPICard.tsx
            ├── KPIGrid.tsx
            ├── StatusBadge.tsx
            ├── DateRangePicker.tsx
            ├── CampaignsTable.tsx
            ├── AdSetsTable.tsx
            ├── AdsTable.tsx
            ├── AccountSelector.tsx
            ├── SpendChart.tsx
            └── FacebookAdsManager.tsx
```

## 🚀 Instalação Rápida

### Opção 1: Copiar tudo (recomendado)
```bash
# Extraia o ZIP e copie a pasta src inteira
# Arquivos existentes serão substituídos
cp -r meta-ads-export/src/* seu-projeto/src/
```

### Opção 2: Copiar seletivamente
```bash
# Novos arquivos (não existem no projeto)
cp -r meta-ads-export/src/app/api/meta seu-projeto/src/app/api/
cp -r meta-ads-export/src/app/api/ads seu-projeto/src/app/api/
cp meta-ads-export/src/lib/meta-api.ts seu-projeto/src/lib/
cp meta-ads-export/src/utils/ads-formatting.ts seu-projeto/src/utils/

# Arquivos que substituem existentes
cp meta-ads-export/src/lib/oauth-security.ts seu-projeto/src/lib/
cp meta-ads-export/src/types/facebook.ts seu-projeto/src/types/
cp meta-ads-export/src/hooks/useFacebookAds.ts seu-projeto/src/hooks/
cp meta-ads-export/src/hooks/useStore.ts seu-projeto/src/hooks/
cp -r meta-ads-export/src/components/ads seu-projeto/src/components/
cp meta-ads-export/src/app/api/integrations/meta/* seu-projeto/src/app/api/integrations/meta/
cp "meta-ads-export/src/app/(dashboard)/analytics/facebook/page.tsx" "seu-projeto/src/app/(dashboard)/analytics/facebook/"
```

## ⚙️ Configuração

### 1. Variáveis de ambiente (.env.local)

```env
META_APP_ID=seu_app_id_do_meta
META_APP_SECRET=seu_app_secret_do_meta
OAUTH_STATE_SECRET=uma_string_aleatoria_longa_32_chars
```

### 2. Meta Developer Console

1. Acesse https://developers.facebook.com/
2. Crie ou selecione seu App
3. **Settings > Basic**: Copie App ID e App Secret
4. **Facebook Login > Settings**: Adicione callback URL:
   ```
   https://seu-dominio.com/api/integrations/meta/callback
   ```
5. **App Review > Permissions**: Solicite:
   - `ads_read`
   - `ads_management`
   - `business_management`
   - `read_insights`

### 3. SQL (se ainda não executou)

```sql
-- Campos novos em meta_accounts
ALTER TABLE meta_accounts ADD COLUMN IF NOT EXISTS store_id UUID REFERENCES shopify_stores(id);
ALTER TABLE meta_accounts ADD COLUMN IF NOT EXISTS meta_user_id TEXT;
ALTER TABLE meta_accounts ADD COLUMN IF NOT EXISTS meta_user_name TEXT;
ALTER TABLE meta_accounts ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'connected';
ALTER TABLE meta_accounts ADD COLUMN IF NOT EXISTS connected_at TIMESTAMPTZ DEFAULT NOW();

-- Índices
CREATE INDEX IF NOT EXISTS idx_meta_accounts_store_id ON meta_accounts(store_id);
```

## 📖 APIs Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/meta/accounts?store_id=UUID` | Listar contas |
| DELETE | `/api/meta/accounts` | Desconectar conta |
| GET | `/api/meta/campaigns?store_id=UUID&date_from=&date_to=` | Campanhas com métricas |
| GET | `/api/meta/adsets?store_id=UUID&campaign_id=123` | Ad sets de uma campanha |
| GET | `/api/meta/ads?store_id=UUID&adset_id=456` | Anúncios de um ad set |
| GET | `/api/meta/insights?store_id=UUID&compare=true` | KPIs agregados |
| POST | `/api/meta/sync` | Sincronizar dados |
| PATCH | `/api/ads/status` | Ativar/Pausar |

## 🎯 Uso no React

```tsx
import { useFacebookAds } from '@/hooks/useFacebookAds';

function MetaAdsPage() {
  const { 
    campaigns, 
    kpis, 
    dateRange, 
    setDateRange,
    toggleStatus,
    selectCampaign
  } = useFacebookAds(storeId);
  
  return (
    <div>
      {campaigns.map(c => (
        <div key={c.id}>
          {c.name} - ROAS: {c.metrics.roas}
        </div>
      ))}
    </div>
  );
}
```

## ⚠️ Notas

- Tokens expiram em 60 dias (refresh automático será implementado)
- Rate limit do Meta: 200 chamadas/hora/usuário
- Dados são buscados em tempo real da API do Meta
