import { describe, it, expect, vi, beforeEach } from 'vitest'
import { SessionBridge } from '../session-bridge.js'
import { MessageTransformer } from '../../message-transformer.js'
import type { IChannelAdapter } from '../../channel.js'
import type { Session } from '../session.js'
import type { AgentEvent } from '../../types.js'
import { TypedEmitter } from '../../utils/typed-emitter.js'

function createMockSession() {
  const emitter = new TypedEmitter()
  return Object.assign(emitter, {
    id: 'test-session',
    channelId: 'telegram',
    name: 'Test',
    threadId: '123',
    agentName: 'claude',
    agentSessionId: 'agent-1',
    workingDirectory: '/tmp',
    status: 'active',
    createdAt: new Date(),
    promptCount: 0,
    dangerousMode: false,
    currentMode: undefined,
    availableModes: [],
    configOptions: [],
    currentModel: undefined,
    availableModels: [],
    permissionGate: { setPending: vi.fn() },
    agentInstance: Object.assign(new TypedEmitter(), {
      sessionId: 'agent-1',
      on: vi.fn(),
      off: vi.fn(),
      onPermissionRequest: vi.fn(),
    }),
    setName: vi.fn(),
    finish: vi.fn(),
    fail: vi.fn(),
    updateMode: vi.fn(),
    updateConfigOptions: vi.fn(),
    updateModel: vi.fn(),
    toAcpStateSnapshot: vi.fn().mockReturnValue({}),
  }) as unknown as Session
}

function createMockAdapter(): IChannelAdapter {
  return {
    name: 'test',
    capabilities: { streaming: false, richFormatting: false, threads: false, reactions: false, fileUpload: false, voice: false },
    start: vi.fn(),
    stop: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    sendPermissionRequest: vi.fn().mockResolvedValue(undefined),
    sendNotification: vi.fn().mockResolvedValue(undefined),
    createSessionThread: vi.fn().mockResolvedValue('thread-1'),
    renameSessionThread: vi.fn().mockResolvedValue(undefined),
  } as unknown as IChannelAdapter
}

describe('SessionBridge ACP events', () => {
  let session: ReturnType<typeof createMockSession>
  let adapter: IChannelAdapter
  let bridge: SessionBridge

  beforeEach(() => {
    session = createMockSession()
    adapter = createMockAdapter()
    bridge = new SessionBridge(session as unknown as Session, adapter, {
      messageTransformer: new MessageTransformer(),
      notificationManager: { notify: vi.fn() } as any,
      sessionManager: { patchRecord: vi.fn() } as any,
    })
    bridge.connect()
  })

  it('session_info_update with title calls setName and sends message', async () => {
    const event: AgentEvent = { type: 'session_info_update', title: 'New Title' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(session.setName).toHaveBeenCalledWith('New Title')
      expect(adapter.sendMessage).toHaveBeenCalled()
    })
  })

  it('session_info_update without title sends message but does not call setName', async () => {
    const event: AgentEvent = { type: 'session_info_update', updatedAt: '2026-03-26' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(session.setName).not.toHaveBeenCalled()
      expect(adapter.sendMessage).toHaveBeenCalled()
    })
  })

  it('current_mode_update calls updateMode and sends message', async () => {
    const event: AgentEvent = { type: 'current_mode_update', modeId: 'architect' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(session.updateMode).toHaveBeenCalledWith('architect')
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'mode_change' }))
    })
  })

  it('config_option_update calls updateConfigOptions and sends message', async () => {
    const event: AgentEvent = {
      type: 'config_option_update',
      options: [{ id: 'model', name: 'Model', type: 'select', currentValue: 'sonnet', options: [] }],
    }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(session.updateConfigOptions).toHaveBeenCalled()
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'config_update' }))
    })
  })

  it('model_update calls updateModel and sends message', async () => {
    const event: AgentEvent = { type: 'model_update', modelId: 'opus' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(session.updateModel).toHaveBeenCalledWith('opus')
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'model_update' }))
    })
  })

  it('user_message_chunk sends message to adapter', async () => {
    const event: AgentEvent = { type: 'user_message_chunk', content: 'Hello' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'user_replay' }))
    })
  })

  it('resource_content sends message to adapter', async () => {
    const event: AgentEvent = { type: 'resource_content', uri: 'file:///a.txt', name: 'a.txt', text: 'hi' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'resource' }))
    })
  })

  it('resource_link sends message to adapter', async () => {
    const event: AgentEvent = { type: 'resource_link', uri: 'https://ex.com', name: 'Ex' }
    session.emit('agent_event', event)
    await vi.waitFor(() => {
      expect(adapter.sendMessage).toHaveBeenCalledWith('test-session', expect.objectContaining({ type: 'resource_link' }))
    })
  })
})
