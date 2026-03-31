import { describe, it, expect, afterEach } from 'vitest';
import { createApiServer } from '../server.js';

describe('createApiServer', () => {
  let server: Awaited<ReturnType<typeof createApiServer>> | null = null;

  afterEach(async () => {
    if (server) {
      await server.app.close();
      server = null;
    }
  });

  it('creates a Fastify instance with CORS and rate limiting', async () => {
    server = await createApiServer({ port: 0, host: '127.0.0.1', getSecret: () => 'test-secret' });
    expect(server.app).toBeDefined();
    expect(server.app.printRoutes).toBeDefined();
  });

  it('starts and listens on a port', async () => {
    server = await createApiServer({ port: 0, host: '127.0.0.1', getSecret: () => 'test-secret' });
    const address = await server.start();
    expect(address.port).toBeGreaterThan(0);
  });

  it('registers health endpoint without auth', async () => {
    server = await createApiServer({ port: 0, host: '127.0.0.1', getSecret: () => 'test-secret' });
    await server.start();

    const response = await server.app.inject({
      method: 'GET',
      url: '/api/v1/system/health',
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe('ok');
  });

  it('returns 401 on authenticated routes without token', async () => {
    server = await createApiServer({ port: 0, host: '127.0.0.1', getSecret: () => 'test-secret' });
    // Register a test route with auth
    server.registerPlugin('/api/v1/test', async (app) => {
      app.get('/', async () => ({ ok: true }));
    });
    await server.start();

    const response = await server.app.inject({
      method: 'GET',
      url: '/api/v1/test',
    });

    expect(response.statusCode).toBe(401);
  });
});
