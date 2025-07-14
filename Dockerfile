# Stage 1: Builder
FROM node:18-alpine AS builder

# Dependencias del sistema
RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

# 1. Instalar dependencias
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

RUN npm ci

# 2. Generar cliente Prisma
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npx prisma generate || (echo "Prisma generate failed" && exit 1)

# 3. Copiar código y construir
COPY . .
RUN npm run build || (echo "Build failed" && cat package.json && exit 1)

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
