import swaggerJsdoc from 'swagger-jsdoc';
import { version } from '../../../package.json';

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
        - 500: Error interno del servidor
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
        url: 'http://localhost:3004',
        description: 'Servidor de desarrollo',
      },
      {
        url: 'https://api.educaplus.com',
        description: 'Servidor de producción',
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    },
    security: [{
      bearerAuth: []
    }]
  },
  apis: [
    './src/infrastructure/web/**/*.routes.ts',
    './src/infrastructure/web/**/*.docs.ts',
    './src/domain/**/*.entity.ts'
  ]
};

const specs = swaggerJsdoc(options);

export { specs };