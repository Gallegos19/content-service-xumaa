# Stage 1: Builder
FROM node:18-alpine AS builder

# 1. Instalar dependencias del sistema
RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

# 2. Instalar dependencias de Node
COPY package.json package-lock.json* ./
RUN npm ci

# 3. Configurar Prisma
COPY prisma ./prisma/
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"
RUN npx prisma generate --no-engine || (echo "PRISMA GENERATE FAILED" && exit 1)

# 4. Copiar código fuente
COPY . .

# 5. Verificar estructura de archivos
RUN ls -l src/ && ls -l prisma/

# 6. Ejecutar build con más verbosidad
RUN npm run build --verbose || \
    (echo "BUILD FAILED - SHOWING TS CONFIG" && \
     cat tsconfig.json && \
     echo "SHOWING PACKAGE.JSON" && \
     cat package.json && \
     exit 1)

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
