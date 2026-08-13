# Estágio 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

# Copia o package.json raiz, pacotes compartilhados e a aplicação backend
COPY package.json ./
COPY packages/label-schema ./packages/label-schema
COPY packages/contracts ./packages/contracts
COPY apps/backend ./apps/backend

# Compila os pacotes compartilhados
WORKDIR /app/packages/label-schema
RUN npm install && npm run build

WORKDIR /app/packages/contracts
RUN npm install && npm run build

# Compila o backend
WORKDIR /app/apps/backend
RUN npm install && npm run build

# Estágio 2: Runner de produção
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Copia pacotes e a aplicação compilada do builder
COPY --from=builder /app/packages/label-schema ./packages/label-schema
COPY --from=builder /app/packages/contracts ./packages/contracts
COPY --from=builder /app/apps/backend ./apps/backend

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/index.js"]
