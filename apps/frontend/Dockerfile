# Estágio 1: Build da aplicação React/Vite
FROM node:20-alpine AS builder

WORKDIR /app

# Copia package.json do workspace e do frontend
COPY package.json ./
COPY apps/frontend/package.json ./apps/frontend/
COPY apps/frontend/tsconfig.json ./apps/frontend/
COPY apps/frontend/vite.config.ts ./apps/frontend/
COPY apps/frontend/index.html ./apps/frontend/
COPY apps/frontend/src ./apps/frontend/src

# Instala dependências e compila
WORKDIR /app/apps/frontend
RUN npm install
RUN npm run build

# Estágio 2: Nginx para servir arquivos estáticos
FROM nginx:alpine AS runner

COPY --from=builder /app/apps/frontend/dist /usr/share/nginx/html
COPY apps/frontend/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
