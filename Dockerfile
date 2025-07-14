# Stage 1: Builder
FROM node:18-alpine AS builder

# Dependencias del sistema para Prisma y build
RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

# Copia archivos necesarios para instalar dependencias
COPY package.json package-lock.json* ./
COPY prisma ./prisma/

# Establece DATABASE_URL dummy para el build
ENV DATABASE_URL="postgresql://user:password@localhost:5432/db"

# Instala dependencias y genera cliente Prisma
RUN npm ci
RUN npx prisma generate

# Copia el resto y construye
COPY . .
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

WORKDIR /app

# Copia solo lo necesario para producción
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

# Variables de entorno
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
