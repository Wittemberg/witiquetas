# Estágio 1: Build da aplicação React/Vite
FROM node:22-alpine AS builder

ARG GITHUB_SHA=unknown
ARG SHORT_SHA=unknown
ARG BUILT_AT=unknown

WORKDIR /app

# Copia o monorepo (package.json raiz, pacotes e frontend)
COPY package.json ./
COPY packages/label-schema ./packages/label-schema
COPY packages/contracts ./packages/contracts
COPY packages/printer-core ./packages/printer-core
COPY packages/printer-ppla ./packages/printer-ppla
COPY packages/printer-pplb ./packages/printer-pplb
COPY apps/frontend ./apps/frontend

# Instala dependências do monorepo e compila os pacotes e a aplicação
RUN npm install

WORKDIR /app/packages/label-schema
RUN npm run build

WORKDIR /app/packages/contracts
RUN npm run build

WORKDIR /app/packages/printer-core
RUN npm run build

WORKDIR /app/packages/printer-ppla
RUN npm run build

WORKDIR /app/packages/printer-pplb
RUN npm run build

WORKDIR /app/apps/frontend
RUN npm run build

# Gerar version.json imutável durante o build
RUN echo "{\"commit\":\"${GITHUB_SHA}\",\"shortCommit\":\"${SHORT_SHA}\",\"builtAt\":\"${BUILT_AT}\",\"imageTag\":\"production-${GITHUB_SHA}\"}" > /app/apps/frontend/dist/version.json

# Estágio 2: Nginx para servir arquivos estáticos
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
