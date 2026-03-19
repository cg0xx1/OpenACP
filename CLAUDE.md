# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is OpenACP

A self-hosted bridge that connects AI coding agents (Claude Code, Codex) to messaging platforms (Telegram, Discord) via the Agent Client Protocol (ACP). Users send messages in Telegram; OpenACP routes them to AI agent subprocesses over ACP's JSON-RPC/stdio transport.

## Build & Run Commands

```bash
pnpm install          # Install all workspace dependencies
pnpm build            # Build all packages (runs tsc in each)
pnpm dev              # Watch-mode build for core package
pnpm start            # Run the server (node packages/core/dist/main.js)
```

Build a single package:
```bash
pnpm --filter @openacp/core build
pnpm --filter @openacp/adapter-telegram build
```

No test framework or linter is configured yet.

## Monorepo Structure

pnpm workspaces with two package locations:
- `packages/core` — `@openacp/core`: orchestrator, session/agent lifecycle, config, types
- `packages/adapters/*` — channel adapters (currently only `@openacp/adapter-telegram`)

Adapters depend on core via `workspace:*`. The root `package.json` has a dependency on `@zed-industries/claude-agent-acp`.

## Architecture

**Request flow:** User message → ChannelAdapter → `OpenACPCore.handleMessage()` → `SessionManager` (lookup/create session) → `Session.prompt()` → `AgentInstance.prompt()` (ACP SDK) → agent subprocess. Responses stream back as `AgentEvent`s, converted to `OutgoingMessage`s, and sent to the adapter.

**Key classes in `packages/core/src/`:**
- `OpenACPCore` (`core.ts`) — top-level orchestrator; registers adapters, wires session events
- `AgentManager` (`agent-manager.ts`) — spawns ACP agent subprocesses
- `AgentInstance` (`agent-instance.ts`) — wraps ACP `ClientSideConnection`; implements the Client interface (sessionUpdate, requestPermission, file/terminal ops)
- `SessionManager` (`session-manager.ts`) — maps (channelId, threadId) → Session
- `Session` (`session.ts`) — conversation state with prompt queue and auto-naming
- `ConfigManager` (`config.ts`) — loads `~/.openacp/config.json` with Zod validation; env var overrides (`OPENACP_TELEGRAM_BOT_TOKEN`, etc.)
- `ChannelAdapter` (`channel.ts`) — abstract base class that adapters extend

**Telegram adapter (`packages/adapters/telegram/src/`):**
- `TelegramAdapter` (`adapter.ts`) — extends `ChannelAdapter`; uses grammy
- `MessageDraft` (`streaming.ts`) — buffers streaming responses with 1-second throttle
- `PermissionHandler` (`permissions.ts`) — inline keyboard buttons for agent permission requests
- `Commands` (`commands.ts`) — bot commands: `/new`, `/new_chat`, `/cancel`, `/status`, `/agents`, `/help`

**ACP integration:** Agents are subprocesses communicating via stdio ndjson. `AgentInstance` creates a `ClientSideConnection` from `@agentclientprotocol/sdk` and handles all ACP client callbacks.

## TypeScript Configuration

- Target: ES2022, Module: NodeNext, strict mode
- All packages are ES modules (`"type": "module"`)
- Base config in `tsconfig.base.json`; packages extend it

## Configuration

App config lives at `~/.openacp/config.json`. Schema defined with Zod in `config.ts`. Key sections: `channels.telegram`, `agents` (name → command/args/workingDirectory/env), `defaultAgent`, `workspace.baseDir`, `security` (allowedUserIds, maxConcurrentSessions, sessionTimeoutMinutes).

Environment variable overrides: `OPENACP_CONFIG_PATH`, `OPENACP_TELEGRAM_BOT_TOKEN`, `OPENACP_TELEGRAM_CHAT_ID`, `OPENACP_WORKSPACE_DIR`, `OPENACP_DEBUG`.

## Core Types (`packages/core/src/types.ts`)

- `IncomingMessage` — channelId, threadId, userId, text
- `OutgoingMessage` — type (text, thought, tool_call, tool_update, plan, usage, session_end, error), text, metadata
- `AgentEvent` — union of event types streamed from the agent
- `PermissionRequest` / `NotificationMessage` — for permission UI and notifications
