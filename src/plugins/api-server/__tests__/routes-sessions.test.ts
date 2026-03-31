import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { sessionRoutes } from '../routes/sessions.js';
import { globalErrorHandler } from '../middleware/error-handler.js';
import type { RouteDeps } from '../routes/types.js';

function createMockSession(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sess-1',
    agentName: 'claude',
    status: 'active',
    name: 'Test Session',
    workingDirectory: '/tmp/test',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    dangerousMode: false,
    queueDepth: 0,
    promptRunning: false,
    threadId: 'thread-1',
    channelId: 'api',
    agentSessionId: 'agent-sess-1',
    currentMode: undefined,
    currentModel: undefined,
    availableModes: [],
    availableModels: [],
    configOptions: [],
    agentCapabilities: undefined,
    agentInstance: {
      onPermissionRequest: null,
    },
    permissionGate: {
      isPending: false,
      requestId: null,
      resolve: vi.fn(),
    },
    enqueuePrompt: vi.fn().mockResolvedValue(undefined),
    warmup: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function createMockDeps(overrides: Partial<RouteDeps> = {}): RouteDeps {
  const mockSession = createMockSession();

  return {
    core: {
      sessionManager: {
        listSessions: vi.fn().mockReturnValue([mockSession]),
        getSession: vi.fn().mockReturnValue(mockSession),
        getSessionRecord: vi.fn().mockReturnValue({ lastActiveAt: '2026-01-01T00:00:00Z' }),
        cancelSession: vi.fn().mockResolvedValue(undefined),
        patchRecord: vi.fn().mockResolvedValue(undefined),
      },
      configManager: {
        get: vi.fn().mockReturnValue({
          defaultAgent: 'claude',
          security: { maxConcurrentSessions: 5 },
        }),
        resolveWorkspace: vi.fn().mockReturnValue('/tmp/test'),
      },
      agentCatalog: {
        resolve: vi.fn().mockReturnValue({ workingDirectory: '/tmp/test' }),
      },
      adapters: new Map(),
      createSession: vi.fn().mockResolvedValue(mockSession),
      adoptSession: vi.fn().mockResolvedValue({ ok: true, sessionId: 'sess-1' }),
      archiveSession: vi.fn().mockResolvedValue({ ok: true }),
      agentManager: {
        getAvailableAgents: vi.fn().mockReturnValue([]),
      },
    } as any,
    topicManager: undefined,
    startedAt: Date.now(),
    getVersion: () => '1.0.0',
    ...overrides,
  };
}

describe('session routes', () => {
  let app: FastifyInstance;
  let deps: RouteDeps;

  beforeEach(async () => {
    app = Fastify();
    app.setErrorHandler(globalErrorHandler);
    // Mock auth: decorate request with admin-level auth so scope checks pass
    app.decorateRequest('auth', null, []);
    app.addHook('onRequest', async (request) => {
      request.auth = { type: 'secret', role: 'admin', scopes: ['*'] };
    });
    deps = createMockDeps();
    await app.register(
      async (instance) => {
        await sessionRoutes(instance, deps);
      },
      { prefix: '/api/v1/sessions' },
    );
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('GET /api/v1/sessions', () => {
    it('returns list of sessions', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0].id).toBe('sess-1');
      expect(body.sessions[0].agent).toBe('claude');
      expect(body.sessions[0].status).toBe('active');
    });
  });

  describe('GET /api/v1/sessions/:sessionId', () => {
    it('returns session details', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/sess-1',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.session.id).toBe('sess-1');
      expect(body.session.agent).toBe('claude');
    });

    it('returns 404 for unknown session', async () => {
      (deps.core.sessionManager.getSession as any).mockReturnValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/sessions/unknown',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /api/v1/sessions', () => {
    it('creates a new session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { agent: 'claude' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.sessionId).toBe('sess-1');
      expect(deps.core.createSession).toHaveBeenCalled();
    });

    it('returns 429 when max sessions reached', async () => {
      (deps.core.configManager.get as any).mockReturnValue({
        defaultAgent: 'claude',
        security: { maxConcurrentSessions: 0 },
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: {},
      });

      expect(response.statusCode).toBe(429);
    });

    it('returns 400 for invalid adapter', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions',
        payload: { channel: 'nonexistent' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/sessions/adopt', () => {
    it('adopts an existing agent session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/adopt',
        payload: { agent: 'claude', agentSessionId: 'ext-123' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('validates required fields', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/adopt',
        payload: { agent: '' },
      });

      // Zod validation will reject empty string (min 1)
      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/sessions/:sessionId/prompt', () => {
    it('enqueues a prompt', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/prompt',
        payload: { prompt: 'Hello!' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
      const session = (deps.core.sessionManager.getSession as any).mock.results[0].value;
      expect(session.enqueuePrompt).toHaveBeenCalledWith('Hello!');
    });

    it('returns 404 for unknown session', async () => {
      (deps.core.sessionManager.getSession as any).mockReturnValue(null);

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/unknown/prompt',
        payload: { prompt: 'Hello!' },
      });

      expect(response.statusCode).toBe(404);
    });

    it('returns 400 for terminated session', async () => {
      (deps.core.sessionManager.getSession as any).mockReturnValue(
        createMockSession({ status: 'cancelled' }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/prompt',
        payload: { prompt: 'Hello!' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('POST /api/v1/sessions/:sessionId/permission', () => {
    it('resolves a pending permission', async () => {
      const mockResolve = vi.fn();
      (deps.core.sessionManager.getSession as any).mockReturnValue(
        createMockSession({
          permissionGate: {
            isPending: true,
            requestId: 'perm-1',
            resolve: mockResolve,
          },
        }),
      );

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/permission',
        payload: { permissionId: 'perm-1', optionId: 'allow' },
      });

      expect(response.statusCode).toBe(200);
      expect(mockResolve).toHaveBeenCalledWith('allow');
    });

    it('returns 400 when no matching permission', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/permission',
        payload: { permissionId: 'wrong-id', optionId: 'allow' },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('PATCH /api/v1/sessions/:sessionId/dangerous', () => {
    it('toggles dangerous mode', async () => {
      const response = await app.inject({
        method: 'PATCH',
        url: '/api/v1/sessions/sess-1/dangerous',
        payload: { enabled: true },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.dangerousMode).toBe(true);
    });
  });

  describe('POST /api/v1/sessions/:sessionId/archive', () => {
    it('archives a session', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/archive',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.ok).toBe(true);
    });

    it('returns 400 on archive failure', async () => {
      (deps.core.archiveSession as any).mockResolvedValue({
        ok: false,
        error: 'Not supported',
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/sessions/sess-1/archive',
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('DELETE /api/v1/sessions/:sessionId', () => {
    it('cancels a session', async () => {
      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/sessions/sess-1',
      });

      expect(response.statusCode).toBe(200);
      expect(deps.core.sessionManager.cancelSession).toHaveBeenCalledWith(
        'sess-1',
      );
    });

    it('returns 404 for unknown session', async () => {
      (deps.core.sessionManager.getSession as any).mockReturnValue(null);

      const response = await app.inject({
        method: 'DELETE',
        url: '/api/v1/sessions/unknown',
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
