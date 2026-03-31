import Fastify, { type FastifyInstance, type FastifyPluginAsync } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import fastifyRateLimit from '@fastify/rate-limit';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { globalErrorHandler } from './middleware/error-handler.js';
import { createAuthPreHandler, requireScopes, requireRole } from './middleware/auth.js';

export interface ApiServerOptions {
  port: number;
  host: string;
  getSecret: () => string;
  logger?: boolean;
}

export interface ApiServerInstance {
  app: FastifyInstance;
  start(): Promise<{ port: number; host: string }>;
  stop(): Promise<void>;
  registerPlugin(prefix: string, plugin: FastifyPluginAsync, opts?: { auth?: boolean }): void;
}

export async function createApiServer(options: ApiServerOptions): Promise<ApiServerInstance> {
  const app = Fastify({ logger: options.logger ?? false });

  // Zod validation
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  // Plugins
  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyRateLimit, { max: 100, timeWindow: '1 minute' });
  await app.register(fastifySwagger, {
    openapi: {
      info: { title: 'OpenACP API', version: '1.0.0' },
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
      },
    },
  });
  await app.register(fastifySwaggerUi, { routePrefix: '/api/docs' });

  // Global error handler
  app.setErrorHandler(globalErrorHandler);

  // Auth pre-handler
  const authPreHandler = createAuthPreHandler(options.getSecret);

  // Decorate request with auth object
  app.decorateRequest('auth', null, []);

  // System routes (no auth required for health)
  await app.register(
    async (app) => {
      app.get('/health', async () => ({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      }));

      app.get('/version', { preHandler: authPreHandler }, async () => ({
        version: process.env.npm_package_version ?? 'unknown',
      }));
    },
    { prefix: '/api/v1/system' },
  );

  return {
    app,

    registerPlugin(prefix: string, plugin: FastifyPluginAsync, opts?: { auth?: boolean }) {
      const wrappedPlugin: FastifyPluginAsync = async (pluginApp, pluginOpts) => {
        if (opts?.auth !== false) {
          pluginApp.addHook('onRequest', authPreHandler);
        }
        await plugin(pluginApp, pluginOpts);
      };
      app.register(wrappedPlugin, { prefix });
    },

    async start() {
      await app.ready();
      const address = await app.listen({ port: options.port, host: options.host });
      const url = new URL(address);
      return { port: Number(url.port), host: url.hostname };
    },

    async stop() {
      await app.close();
    },
  };
}
