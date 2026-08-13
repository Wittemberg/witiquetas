# Estágio 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copia arquivos do workspace e do backend
COPY package.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/tsconfig.json ./apps/backend/
COPY apps/backend/src ./apps/backend/src

# Instala dependências do backend
WORKDIR /app/apps/backend
RUN npm install
RUN npm run build

# Estágio 2: Runner de produção
FROM node:20-alpine AS runner

WORKDIR /app/apps/backend

ENV NODE_ENV=production
ENV PORT=3000

# Copia package.json e instala apenas dependências de produção
COPY apps/backend/package.json ./
RUN npm install --only=production

# Copia o código compilado do builder
COPY --from=builder /app/apps/backend/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
