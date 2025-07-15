# Stage 1: Builder
FROM node:18-alpine AS builder

# 1. Install system dependencies
RUN apk add --no-cache openssl python3 make g++ git libc6-compat

WORKDIR /app

# 2. Install Node dependencies
COPY package.json package-lock.json* ./
RUN npm ci --include=dev

# 3. Configure Prisma
COPY prisma ./prisma/
RUN npx prisma generate

# 4. Copy source code
COPY . .

# 5. Build project
RUN npm run build || (echo "BUILD FAILED" && find src -name "*.ts" | xargs ls -la && exit 1)

# Stage 2: Runtime
FROM node:18-alpine
WORKDIR /app

# Copy only production dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
