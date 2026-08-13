# Estágio 1: Build da aplicação React/Vite
FROM node:22-alpine AS builder

WORKDIR /app

# Copia o package.json raiz, pacotes compartilhados e a aplicação frontend
COPY package.json ./
COPY packages/label-schema ./packages/label-schema
COPY packages/contracts ./packages/contracts
COPY apps/frontend ./apps/frontend

# Compila os pacotes compartilhados
WORKDIR /app/packages/label-schema
RUN npm install && npm run build

WORKDIR /app/packages/contracts
RUN npm install && npm run build

# Compila o frontend
WORKDIR /app/apps/frontend
RUN npm install && npm run build

# Estágio 2: Nginx para servir arquivos estáticos
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
