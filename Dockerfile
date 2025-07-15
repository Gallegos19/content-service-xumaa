# Stage 1: Builder
FROM node:18-alpine AS builder

RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

COPY package.json package-lock.json* ./

# Fuerza entorno de desarrollo para instalar devDependencies
ENV NODE_ENV=development
RUN npm ci

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .

# Build del proyecto
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

# Producción pura
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 3000


CMD ["node", "-r", "tsconfig-paths/register", "dist/src/main.js"]
