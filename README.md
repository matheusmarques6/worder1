# 🔥 Fase 0: Spike Técnico - Sistema de Relatórios PDF

## 📋 Checklist de Implementação

### 1. Instalar Dependência

```bash
npm install @react-pdf/renderer
```

### 2. Copiar Arquivos

Copie os arquivos para o projeto Worder:

```
# Criar pasta se não existir
mkdir -p src/lib/reports/assets
mkdir -p src/app/api/reports/poc

# Copiar arquivos
cp src/lib/reports/assets/logo.ts      → seu-projeto/src/lib/reports/assets/logo.ts
cp src/lib/reports/assets/index.ts     → seu-projeto/src/lib/reports/assets/index.ts
cp src/lib/reports/index.ts            → seu-projeto/src/lib/reports/index.ts
cp src/app/api/reports/poc/route.ts    → seu-projeto/src/app/api/reports/poc/route.ts
```

### 3. Verificar Tipos

```bash
npm run type-check
# ou
npx tsc --noEmit
```

### 4. Build

```bash
npm run build
```

### 5. Testar Local

```bash
npm run start
```

Abrir no browser:
```
http://localhost:3000/api/reports/poc
```

O PDF deve baixar automaticamente!

---

## 📁 Estrutura de Arquivos

```
src/
├── lib/
│   └── reports/
│       ├── index.ts                    # Exports públicos
│       └── assets/
│           ├── index.ts                # Export do logo
│           └── logo.ts                 # Logo em base64
│
└── app/
    └── api/
        └── reports/
            └── poc/
                └── route.ts            # Rota de teste
```

---

## ✅ Validações da Fase 0

| Validação | Comando/Ação | Esperado |
|-----------|--------------|----------|
| TypeScript | `npm run type-check` | Sem erros |
| Build | `npm run build` | Build passa |
| Servidor | `npm run start` | Inicia sem erros |
| Download | `GET /api/reports/poc` | PDF baixa |
| Conteúdo | Abrir PDF | Logo, KPIs, Tabela visíveis |
| Paginação | Ver rodapé | "Página 1 de 1" aparece |

---

## 🐛 Troubleshooting

### Erro: "Cannot find module '@react-pdf/renderer'"
```bash
# Reinstalar
npm install @react-pdf/renderer
```

### Erro: "Dynamic server usage"
```typescript
// Garantir que a rota tem:
export const dynamic = 'force-dynamic'
```

### Erro: Build falha com "Top-level await"
```typescript
// Garantir que a rota tem:
export const runtime = 'nodejs'
```

### Erro: PDF corrompido
```typescript
// Verificar headers:
headers: {
  'Content-Type': 'application/pdf',
  'Content-Disposition': 'attachment; filename="..."',
}
```

### Erro: Logo não aparece
```typescript
// Verificar se o base64 é válido
// Testar em: https://codebeautify.org/base64-to-image-converter
```

---

## 🔄 Substituir Logo Placeholder

O logo atual é um placeholder SVG. Para usar o logo real do Worder:

### Opção 1: Online
1. Acesse https://www.base64-image.de/
2. Upload do logo PNG (recomendado: 240x80px)
3. Copie o resultado
4. Substitua em `src/lib/reports/assets/logo.ts`

### Opção 2: Via Script
```javascript
// No terminal do projeto:
node -e "
const fs = require('fs');
const logo = fs.readFileSync('./public/logo.png');
console.log('data:image/png;base64,' + logo.toString('base64'));
"
```

### Opção 3: Via Browser DevTools
```javascript
// Abra a imagem no browser, depois no Console:
const img = document.querySelector('img'); // selecione a imagem
const canvas = document.createElement('canvas');
canvas.width = img.naturalWidth;
canvas.height = img.naturalHeight;
canvas.getContext('2d').drawImage(img, 0, 0);
console.log(canvas.toDataURL('image/png'));
```

---

## 📊 O que o PDF de Teste Mostra

1. **Header** - Logo + Título + Data de geração
2. **KPIs** - 3 cards com valores, labels e variações
3. **Tabela** - Top 5 Deals com colunas
4. **Validação** - Box verde confirmando que tudo funciona
5. **Footer** - "Worder CRM" + Paginação

---

## ✅ GO/NO-GO Decision

Após validar todos os itens:

**GO** ✅ - Se tudo funcionar:
- Prosseguir para Fase 1
- Commit: `git commit -m "feat(reports): Fase 0 - Spike técnico @react-pdf/renderer"`

**NO-GO** ❌ - Se houver problemas críticos:
- Documentar o erro
- Avaliar alternativas:
  - `puppeteer` (mais pesado, mas mais flexível)
  - `pdfkit` (mais baixo nível)
  - `jspdf` (client-side)

---

## 🚀 Próximos Passos (após Fase 0)

1. **Fase 1**: Criar estrutura completa de pastas + contracts
2. **Fase 2**: Criar componentes reutilizáveis (Header, Table, etc)
3. **Fase 3**: Criar rotas reais com auth
4. **Fase 4**: Criar templates de relatório
5. **Fase 5**: Integrar ExportButton nas páginas

---

**Boa sorte! 🍀**
