import type { FastifyInstance } from 'fastify';
import type { RouteDeps } from './types.js';
import { requireScopes } from '../middleware/auth.js';

export async function tunnelRoutes(
  app: FastifyInstance,
  deps: RouteDeps,
): Promise<void> {
  // GET /tunnel — get tunnel status
  app.get('/', { preHandler: requireScopes('system:health') }, async () => {
    const tunnel = deps.core.tunnelService;
    if (tunnel) {
      return {
        enabled: true,
        url: tunnel.getPublicUrl(),
        provider: deps.core.configManager.get().tunnel.provider,
      };
    }
    return { enabled: false };
  });

  // GET /tunnel/list — list all active tunnels
  app.get('/list', { preHandler: requireScopes('system:health') }, async () => {
    const tunnel = deps.core.tunnelService;
    if (!tunnel) {
      return [];
    }
    return tunnel.listTunnels();
  });

  // POST /tunnel — add a new tunnel
  app.post('/', { preHandler: requireScopes('system:admin') }, async (request, reply) => {
    const tunnel = deps.core.tunnelService;
    if (!tunnel) {
      return reply
        .status(400)
        .send({ error: 'Tunnel service is not enabled' });
    }

    const body = request.body as {
      port?: number;
      label?: string;
      sessionId?: string;
    };
    if (!body || !body.port || typeof body.port !== 'number') {
      return reply
        .status(400)
        .send({ error: 'port is required and must be a number' });
    }

    try {
      const entry = await tunnel.addTunnel(body.port, {
        label: body.label,
        sessionId: body.sessionId,
      });
      return entry;
    } catch (err) {
      return reply
        .status(400)
        .send({ error: (err as Error).message });
    }
  });

  // DELETE /tunnel/:port — stop a specific tunnel
  app.delete<{ Params: { port: string } }>('/:port', { preHandler: requireScopes('system:admin') }, async (request, reply) => {
    const tunnel = deps.core.tunnelService;
    if (!tunnel) {
      return reply
        .status(400)
        .send({ error: 'Tunnel service is not enabled' });
    }
    const port = parseInt(request.params.port, 10);
    try {
      await tunnel.stopTunnel(port);
      return { ok: true };
    } catch (err) {
      return reply
        .status(400)
        .send({ error: (err as Error).message });
    }
  });

  // DELETE /tunnel — stop all user tunnels
  app.delete('/', { preHandler: requireScopes('system:admin') }, async (_request, reply) => {
    const tunnel = deps.core.tunnelService;
    if (!tunnel) {
      return reply
        .status(400)
        .send({ error: 'Tunnel service is not enabled' });
    }
    const count = tunnel.listTunnels().length;
    await tunnel.stopAllUser();
    return { ok: true, stopped: count };
  });
}
