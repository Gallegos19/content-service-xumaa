import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../../package.json';
import env from '@shared/config/environment';

const isProd = env.NODE_ENV === 'development';

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Content Service API',
      version,
      description: `
        API para la gestión de contenido educativo
        
        ## Características
        - Gestión completa de contenido educativo
        - Seguimiento de progreso del usuario
        - Sistema de tips y recomendaciones
        - Analíticas y métricas de engagement
        - Organización por temas y módulos
        
        ## Autenticación
        Todos los endpoints requieren autenticación mediante Bearer Token.
        
        ## Códigos de Respuesta
        - 200: Éxito
        - 201: Creado exitosamente
        - 204: Sin contenido (eliminación exitosa)
        - 400: Error de validación
        - 401: No autorizado
        - 403: Prohibido
        - 404: No encontrado
      `,
      contact: {
        name: 'Soporte Técnico',
        email: 'soporte@educaplus.com',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:3004/',
        description: env.NODE_ENV === 'production' ? 'Production server' : 'Development server'
      }
    ],
    components: {
      schemas: {
        Content: {
          type: 'object',
          required: ['title', 'content_type', 'main_media_id', 'thumbnail_media_id'],
          properties: {
            id: {
              type: 'string',
              format: 'uuid',
              description: 'ID único del contenido'
            },
            title: {
              type: 'string',
              description: 'Título del contenido'
            },
            description: {
              type: 'string',
              nullable: true,
              description: 'Descripción detallada del contenido'
            },
            content_type: {
              type: 'string',
              enum: ['VIDEO', 'ARTICLE', 'QUIZ', 'INTERACTIVE', 'OTHER'],
              description: 'Tipo de contenido'
            },
            main_media_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID del recurso multimedia principal'
            },
            thumbnail_media_id: {
              type: 'string',
              format: 'uuid',
              description: 'ID del recurso multimedia para miniatura'
            },
            tags: {
              type: 'array',
              items: {
                type: 'string'
              },
              nullable: true,
              description: 'Etiquetas asociadas al contenido'
            },
            metadata: {
              type: 'object',
              additionalProperties: true,
              nullable: true,
              description: 'Metadatos adicionales del contenido'
            }
          }
        }
      },
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{ bearerAuth: [] }]
  },
  apis: isProd
    ? [
        './dist/src/infrastructure/web/**/*.routes.js',
        './dist/src/infrastructure/web/**/*.controller.js',
        './dist/src/domain/**/*.entity.js'
      ]
    : [
        './src/infrastructure/web/**/*.routes.ts',
        './src/infrastructure/web/**/*.controller.ts',
        './src/domain/**/*.entity.ts'
      ]
};

const specs = swaggerJsdoc(options);

export { specs };