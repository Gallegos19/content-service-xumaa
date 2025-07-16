# Stage 1: Builder
FROM node:18-alpine AS builder

RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

COPY package.json package-lock.json ./

# Clean install dependencies
RUN npm cache clean --force \
    && npm install -g npm@latest \
    && npm ci --no-audit --prefer-offline

# Copy remaining files
COPY prisma ./prisma/
COPY tsconfig.json ./
COPY . .

RUN npx prisma generate
RUN npm run build

# Stage 2: Runtime
FROM node:18-alpine

RUN apk add --no-cache openssl

WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/tsconfig.json ./

EXPOSE 3000

CMD ["node", "-r", "tsconfig-paths/register", "dist/src/main.js"]
