# Stage 1: Builder
FROM node:18-alpine AS builder

# 1. Instala dependencias del sistema necesarias para node-gyp y Prisma
RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

# 2. Copia archivos de dependencias y las instala
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# 3. Prisma - generar cliente
COPY prisma ./prisma/
RUN npx prisma generate

# 4. Copia el resto del código fuente
COPY . .

# 5. Compila la aplicación
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

# Copia solo lo necesario para producción
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "-r", "tsconfig-paths/register", "dist/src/main.js"]
