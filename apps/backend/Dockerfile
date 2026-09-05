# Estágio 1: Build
FROM node:22-alpine AS builder

ARG GITHUB_SHA=unknown
ARG SHORT_SHA=unknown
ARG BUILT_AT=unknown

WORKDIR /app

# Copia o monorepo (package.json raiz, pacotes e backend)
COPY package.json ./
COPY packages/label-schema ./packages/label-schema
COPY packages/contracts ./packages/contracts
COPY packages/printer-core ./packages/printer-core
COPY packages/printer-ppla ./packages/printer-ppla
COPY packages/printer-pplb ./packages/printer-pplb
COPY apps/backend ./apps/backend
COPY docs/development-control ./docs/development-control

# Instala dependências e compila os pacotes e a aplicação
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

WORKDIR /app/apps/backend
RUN npm run build

# Validação do binário do Agent no estágio builder
RUN test -f /app/apps/backend/bin/agents/witiquetas-agent-windows-x64.exe
RUN test $(stat -c%s /app/apps/backend/bin/agents/witiquetas-agent-windows-x64.exe) -gt 1000000

# Estágio 2: Runner de produção
FROM node:22-alpine AS runner

ARG GITHUB_SHA=unknown
ARG SHORT_SHA=unknown
ARG BUILT_AT=unknown

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV ENABLE_DEV_CONTROL_CENTER=true
ENV GITHUB_SHA=$GITHUB_SHA
ENV GIT_COMMIT=$GITHUB_SHA
ENV CANDIDATE_SHA=$GITHUB_SHA
ENV RUNNING_SHA=$GITHUB_SHA
ENV SHORT_SHA=$SHORT_SHA
ENV BUILT_AT=$BUILT_AT

# Copia a estrutura completa compilada com as node_modules hoisted do monorepo
COPY --from=builder /app ./

# Validação do binário do Agent no estágio runner final
RUN test -f /app/apps/backend/bin/agents/witiquetas-agent-windows-x64.exe
RUN test $(stat -c%s /app/apps/backend/bin/agents/witiquetas-agent-windows-x64.exe) -gt 1000000

WORKDIR /app/apps/backend

EXPOSE 3000

CMD ["node", "dist/index.js"]
