# -------------------------
# Etapa 1: Build
# -------------------------
    FROM node:18-alpine AS builder

    # Instalar dependencias necesarias
    RUN apk add --no-cache openssl python3 make g++ git libc6-compat
    
    # Establecer directorio de trabajo
    WORKDIR /app
    
    # Copiar solo los archivos necesarios para instalar dependencias
    COPY package.json package-lock.json ./
    
    # Instalar dependencias de producción y desarrollo
    RUN npm ci --no-audit --prefer-offline || npm install --no-audit --prefer-offline
    
    # Copiar el resto de archivos del proyecto
    COPY . .
    
    # Generar cliente de Prisma
    RUN npx prisma generate
    
    # Ejecutar el build del proyecto
    RUN npm run build
    
    # -------------------------
    # Etapa 2: Producción
    # -------------------------
    FROM node:18-alpine
    
    # Instalar solo lo necesario en producción
    RUN apk add --no-cache openssl
    
    # Establecer directorio de trabajo
    WORKDIR /app
    
    # Establecer variable de entorno
    ENV NODE_ENV=production
    
    # Copiar archivos necesarios desde el builder
    COPY --from=builder /app/package*.json ./
    COPY --from=builder /app/node_modules ./node_modules
    COPY --from=builder /app/dist ./dist
    COPY --from=builder /app/prisma ./prisma
    COPY --from=builder /app/tsconfig.json ./

    
    # Exponer el puerto de la aplicación
    EXPOSE 3000
    
    # Comando para ejecutar la app
    CMD ["node", "-r", "tsconfig-paths/register", "dist/src/main.js"]
    