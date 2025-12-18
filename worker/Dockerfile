# =============================================
# WHATSAPP CAMPAIGN WORKER
# Para deploy em Railway/Render
# =============================================

FROM node:20-alpine

WORKDIR /app

# Copiar package.json do root e do worker
COPY package*.json ./
COPY worker/package*.json ./worker/

# Instalar dependências
RUN npm ci --only=production
RUN cd worker && npm ci --only=production

# Copiar código
COPY . .

# Build TypeScript
RUN npm run build 2>/dev/null || true
RUN cd worker && npm run build

# Rodar worker
WORKDIR /app/worker
CMD ["node", "dist/campaign-worker.js"]
