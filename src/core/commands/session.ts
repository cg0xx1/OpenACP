import type { CommandRegistry } from '../command-registry.js'
import type { CommandResponse } from '../plugin/types.js'
import type { OpenACPCore } from '../core.js'

/**
 * System session commands — these are placeholder registrations for discovery
 * (autocomplete, help text, etc.). The actual logic lives in adapter-specific
 * handlers. Handlers return 'silent' so the generic dispatch passes through
 * to the adapter's dedicated handler via next().
 */
export function registerSessionCommands(registry: CommandRegistry, _core: unknown): void {
  const core = _core as OpenACPCore;
  registry.register({
    name: 'new',
    description: 'Start a new session',
    usage: '[agent-name]',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'cancel',
    description: 'Cancel the current agent turn',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'status',
    description: 'Show current session status',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'sessions',
    description: 'List all active sessions',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'clear',
    description: 'Clear session history',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'newchat',
    description: 'New chat, same agent & workspace',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'resume',
    description: 'Resume a previous session',
    usage: '<session-number>',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'handoff',
    description: 'Hand off session to another agent',
    usage: '<agent-name>',
    category: 'system',
    handler: async () => {
      return { type: 'silent' } satisfies CommandResponse
    },
  })

  registry.register({
    name: 'fork',
    description: 'Fork the current session into a new conversation',
    category: 'system',
    handler: async (args) => {
      if (!args.sessionId) {
        return { type: 'error', message: '⚠️ No active session in this topic.' } satisfies CommandResponse;
      }
      const session = core.sessionManager.getSession(args.sessionId);
      if (!session) {
        return { type: 'error', message: '⚠️ Session not found.' } satisfies CommandResponse;
      }
      if (!session.supportsCapability('fork')) {
        return { type: 'error', message: '⚠️ This agent does not support session forking.' } satisfies CommandResponse;
      }
      try {
        const response = await session.agentInstance.forkSession(
          session.agentSessionId,
          session.workingDirectory,
        );
        const newSession = await core.createSession({
          channelId: session.channelId,
          agentName: session.agentName,
          workingDirectory: session.workingDirectory,
          resumeAgentSessionId: response.sessionId,
          createThread: true,
          initialName: `Fork of ${session.name || session.id.slice(0, 6)}`,
        });
        return { type: 'text', text: `Session forked → ${newSession.name || newSession.id}` } satisfies CommandResponse;
      } catch (err) {
        return { type: 'error', message: `⚠️ Fork failed: ${err instanceof Error ? err.message : String(err)}` } satisfies CommandResponse;
      }
    },
  })

  registry.register({
    name: 'close',
    description: 'Close this session permanently',
    category: 'system',
    handler: async (args) => {
      if (!args.sessionId) {
        return { type: 'error', message: '⚠️ No active session in this topic.' } satisfies CommandResponse;
      }
      const session = core.sessionManager.getSession(args.sessionId);
      if (!session) {
        return { type: 'error', message: '⚠️ Session not found.' } satisfies CommandResponse;
      }
      try {
        if (session.supportsCapability('close')) {
          await session.agentInstance.closeSession(session.agentSessionId);
        }
        await core.sessionManager.cancelSession(session.id);
        return { type: 'text', text: 'Session closed.' } satisfies CommandResponse;
      } catch (err) {
        return { type: 'error', message: `⚠️ Close failed: ${err instanceof Error ? err.message : String(err)}` } satisfies CommandResponse;
      }
    },
  })

  registry.register({
    name: 'agentsessions',
    description: 'List sessions known to the agent',
    category: 'system',
    handler: async (args) => {
      if (!args.sessionId) {
        return { type: 'error', message: '⚠️ No active session in this topic.' } satisfies CommandResponse;
      }
      const session = core.sessionManager.getSession(args.sessionId);
      if (!session) {
        return { type: 'error', message: '⚠️ Session not found.' } satisfies CommandResponse;
      }
      if (!session.supportsCapability('list')) {
        return { type: 'error', message: '⚠️ This agent does not support session listing.' } satisfies CommandResponse;
      }
      try {
        const response = await session.agentInstance.listSessions(session.workingDirectory);
        const sessions = (response as any).sessions ?? [];
        if (sessions.length === 0) {
          return { type: 'text', text: 'No sessions found.' } satisfies CommandResponse;
        }
        const lines = sessions.map((s: any, i: number) =>
          `${i + 1}. ${s.title || s.sessionId}${s.updatedAt ? ` (${new Date(s.updatedAt).toLocaleString()})` : ''}`,
        );
        return { type: 'text', text: `Agent sessions:\n${lines.join('\n')}` } satisfies CommandResponse;
      } catch (err) {
        return { type: 'error', message: `⚠️ List failed: ${err instanceof Error ? err.message : String(err)}` } satisfies CommandResponse;
      }
    },
  })
}
