# Menu & Command Dispatch Fix

**Date:** 2026-04-02
**Status:** Draft
**Scope:** Fix broken menu buttons, fix slash commands dispatching to generic core handlers, add button-driven New Session flow

## Problem

The main menu shows 10 buttons. When pressed, the `m:` callback handler dispatches them through `CommandRegistry` (core, generic handlers) or does nothing (`callback` type). This causes:

1. **3 buttons completely broken**: Settings (`callback` type → `break`), Update (placeholder text), Doctor (placeholder text)
2. **3 buttons with degraded UX**: Sessions (loses cleanup buttons, status emoji), Agents (loses pagination, install buttons), Help (generic text instead of rich formatted)
3. **1 button unnecessarily slow**: New Session delegates everything to AI when most steps could use buttons
4. **1 button unreliable**: Restart uses `setTimeout` from callback context
5. **Slash commands have the same problems**: `/agents`, `/sessions`, `/doctor`, `/update`, `/help`, `/restart` all go through core generic handlers, missing Telegram-specific rich UI
6. **1 orphaned callback**: `m:topics` (Refresh button in sessions list) has no handler

Buttons that work correctly: Status, Integrate, and all inner buttons (cleanup, agent install, settings toggle/select, switch, permissions, TTS).

## Design

### Principle

Two layers of command handling already exist:
- **Core handlers** in `CommandRegistry` — platform-agnostic, return `CommandResponse`
- **Telegram handlers** — rich UI with inline keyboards, pagination, progress updates

The problem is that the `m:` menu handler and the slash command dispatcher both route to core handlers exclusively. The fix: register Telegram adapter overrides in `CommandRegistry` so both paths (menu button + slash command) get rich UI.

### Part 1: Telegram Command Overrides via Intercept Map

`CommandRegistry` supports adapter-scoped overrides, but override handlers receive `CommandArgs` — not grammY `Context`. The Telegram handlers (`handleAgents`, `handleDoctor`, etc.) need grammY `Context` for inline keyboards, message editing, and rich UI.

Instead of bridging `CommandArgs` → `Context`, use an intercept map: a lookup table that maps command names to Telegram handler functions. Both the slash command dispatcher and the `m:` menu handler check this map before falling through to `CommandRegistry`.

Commands intercepted:

| Command | Telegram handler | What it does |
|---------|-----------------|-------------|
| `/agents` | `handleAgents(ctx, core)` | Paginated list + install buttons |
| `/sessions` | `handleTopics(ctx, core)` | Status emoji + cleanup buttons + refresh |
| `/doctor` | `handleDoctor(ctx)` | Run diagnostics + show report + fix buttons |
| `/update` | `handleUpdate(ctx, core)` | Version check + download + restart |
| `/restart` | `handleRestart(ctx, core)` | Send message, wait for delivery, then restart |
| `/help` | `handleHelp(ctx)` | Rich formatted help with sections |

Implementation:

```typescript
// Shared intercept map — used by both slash command handler and m: menu handler
const TELEGRAM_OVERRIDES: Record<string, (ctx: Context, core: OpenACPCore) => Promise<void>> = {
  agents: (ctx, core) => handleAgents(ctx, core),
  sessions: (ctx, core) => handleTopics(ctx, core),
  doctor: (ctx, _core) => handleDoctor(ctx),
  update: (ctx, core) => handleUpdate(ctx, core),
  restart: (ctx, core) => handleRestart(ctx, core),
  help: (ctx, _core) => handleHelp(ctx),
}
```

#### Slash command dispatch change

In the `bot.on("message:text")` handler at adapter.ts:322, check the intercept map before `registry.execute()`:

```typescript
// Before: always calls registry.execute()
// After: check intercept map first
const override = TELEGRAM_OVERRIDES[commandName]
if (override) {
  await override(ctx, core)
  return  // don't fall through to registry.execute()
}
const response = await registry.execute(text, { ... })
```

#### Menu `m:` handler change for `command` type

In the `m:` handler's `command` case in `commands/index.ts`, check the intercept map before `registry.execute()`:

```typescript
case 'command': {
  const cmdName = item.action.command.replace(/^\//, '').split(' ')[0]
  const override = TELEGRAM_OVERRIDES[cmdName]
  if (override) {
    await override(ctx, core)
    break
  }
  // Fallback: dispatch through CommandRegistry (for commands without overrides)
  const response = await registry.execute(item.action.command, { ... })
  // ... render response
  break
}
```

The intercept map is defined once and shared between both dispatch paths. Core handlers remain as fallback for non-Telegram channels.

### Part 2: Fix `callback` Type in `m:` Handler

The `m:` handler has `case 'callback': break;` which silently does nothing. This breaks the Settings button (`s:settings` callbackData).

The issue: grammY callback routing already matched `m:core:settings` → the broad `m:` handler consumed it. The `s:settings` callback data is never re-dispatched to `setupSettingsCallbacks`.

Fix: handle known callback data directly in the `callback` case:

```typescript
case 'callback': {
  const cbData = item.action.callbackData
  if (cbData === 's:settings') {
    // Call handleSettings directly — it sends the settings keyboard
    await handleSettings(ctx, core)
  }
  // Future callback types can be added here
  break
}
```

This is a targeted fix. A more general solution (re-dispatching arbitrary callback data) is complex and unnecessary — `s:settings` is currently the only `callback` action in the menu.

### Part 3: New Session Button Flow

Replace the current `delegate` action (sends everything to AI) with a multi-step button flow. AI is only involved when the user needs to type a custom workspace path.

#### Flow

```
[🆕 New Session] (callback: ns:start)
    ↓
📋 Select agent (inline buttons)
  [claude-code]  [gemini]
  [codex]        [goose]
    ↓ user taps agent
📁 Select workspace (inline buttons)
  [~/project-a]         ← from recent session history
  [~/project-b]         ← from recent session history
  [📁 Custom path...]   ← only this goes to AI
    ↓
  If recent workspace selected:
    → createSessionDirect(agent, workspace) — no AI needed
  If "Custom path..." selected:
    → delegate to AI: "User wants session with agent X, ask for workspace path"
```

#### Callback prefix: `ns:`

| Callback data | Action |
|--------------|--------|
| `ns:start` | Show agent picker |
| `ns:agent:{agentKey}` | Show workspace picker for this agent |
| `ns:ws:{agentKey}:{base64-workspace}` | Create session directly |
| `ns:custom:{agentKey}` | Delegate to AI for workspace input |

#### Agent picker

Shows installed agents as inline buttons (max 2 per row). Source: `core.agentCatalog.getAvailable().filter(i => i.installed)`.

If only 1 agent installed → skip agent picker, go directly to workspace picker.

#### Workspace picker

Recent workspaces extracted from session records:

```typescript
const records = core.sessionManager.listRecords()
const workspaces = [...new Set(records.map(r => r.workingDir))]
  .slice(0, 5)  // max 5 recent workspaces
```

Each workspace shown as a button. Plus "📁 Custom path..." at the bottom.

If no recent workspaces → use config `workspace.baseDir` as the only option + Custom.

#### Registration

New function `setupNewSessionCallbacks(bot, core, chatId)` in `commands/new-session.ts`, called from `setupAllCallbacks()` before the broad `m:` handler.

### Part 4: Fix `m:topics` Refresh Button

The sessions list (`handleTopics`) creates a "Refresh" button with callback `m:topics`. This reaches the broad `m:` handler which looks up `menuRegistry.getItem("topics")` → undefined → nothing happens.

Fix: add explicit handling in the `m:` handler for `m:topics`:

```typescript
// In the broad m: handler, before menuRegistry lookup
if (itemId === 'topics') {
  await handleTopics(ctx, core)
  return
}
```

Alternatively, register `m:topics` as a specific callback handler in `setupSessionCallbacks()` (before the broad handler), which is cleaner.

### Part 5: Core Menu Items Update

Changes to `src/core/menu/core-items.ts`:

| Item | Current action | New action | Reason |
|------|---------------|------------|--------|
| New Session | `delegate` | `callback: ns:start` | Button flow instead of AI |
| Restart | `command: /restart` | `command: /restart` | No change — override handles rich UI |
| Update | `command: /update` | `command: /update` | No change — override handles rich UI |

All other items keep their current action type — the adapter overrides handle the rich UI transparently.

## Files Changed

| File | Change | ~LOC |
|------|--------|------|
| `src/plugins/telegram/adapter.ts` | Add `TELEGRAM_OVERRIDES` map, intercept in slash command handler | +20 |
| `src/plugins/telegram/commands/index.ts` | Fix `callback` case, intercept in `m:` handler `command` case, add `m:topics` handling | +30 |
| `src/plugins/telegram/commands/new-session.ts` | Add `setupNewSessionCallbacks()` with `ns:` prefix handlers | +80 |
| `src/core/menu/core-items.ts` | Change New Session action to `callback: ns:start` | ~2 |
| `src/plugins/telegram/commands/session.ts` | Add `m:topics` specific callback (before broad handler) | ~5 |

No files deleted. No core type changes. No breaking changes.

## Complete Flow Diagrams

### Flow 1: User taps "🆕 New Session" menu button

```
User taps [🆕 New Session]
  → callback_data = "m:core:new"
  → broad m: handler → menuRegistry.getItem("core:new")
  → action.type === 'callback', callbackData: 'ns:start'
  → case 'callback': cbData === 'ns:start' → (but ns: handler already registered before m:)

Actually: ns:start is dispatched via the callback case in m: handler
  → shows agent picker buttons
  → user taps [claude-code] → ns:agent:claude-code
  → shows workspace picker: [~/project-a] [~/project-b] [📁 Custom...]
  → user taps [~/project-a] → ns:ws:claude-code:<base64>
  → createSessionDirect(ctx, core, chatId, "claude-code", "~/project-a")
  → ✅ Session created with topic
```

### Flow 2: User taps "🤖 Agents" menu button

```
User taps [🤖 Agents]
  → callback_data = "m:core:agents"
  → broad m: handler → action.type === 'command', command: '/agents'
  → intercept map check: TELEGRAM_OVERRIDES['agents'] exists
  → calls handleAgents(ctx, core)
  → shows paginated agent list with install buttons
```

### Flow 3: User types "/doctor" as slash command

```
User types "/doctor"
  → bot.on("message:text") → commandName = "doctor"
  → intercept map check: TELEGRAM_OVERRIDES['doctor'] exists
  → calls handleDoctor(ctx)
  → shows "Running diagnostics..." → edits message with report + fix buttons
  → (registry.execute() never called)
```

### Flow 4: User taps "⚙️ Settings" menu button

```
User taps [⚙️ Settings]
  → callback_data = "m:core:settings"
  → broad m: handler → action.type === 'callback', callbackData: 's:settings'
  → case 'callback': cbData === 's:settings' → handleSettings(ctx, core)
  → shows settings keyboard with toggle/select buttons
```

### Flow 5: User taps "Refresh" in sessions list

```
User taps [Refresh]
  → callback_data = "m:topics"
  → setupSessionCallbacks handler (registered before broad m: handler)
  → handleTopics(ctx, core)
  → refreshed sessions list with cleanup buttons
```

## Edge Cases

| Case | Behavior |
|------|----------|
| Only 1 agent installed | New Session skips agent picker, goes to workspace picker |
| No recent workspaces | Shows config baseDir + Custom only |
| No agents installed | New Session shows "No agents installed. Use /install" |
| Intercept handler throws | Caught by existing try/catch in slash command handler and `m:` handler |
| User taps old menu button (before update) | `m:core:new` with old `delegate` action — still works via fallback in `m:` handler |
| Workspace path contains special chars | Base64 encoded in callback data, decoded before use |
| Agent key not found after selection | `createSessionDirect` error handling shows error message |

## Testing

1. **Menu button dispatch**: Test each of 10 menu buttons produces correct response (not generic text)
2. **Slash command dispatch**: Test `/agents`, `/sessions`, `/doctor`, `/update`, `/restart`, `/help` produce rich responses
3. **New Session flow**: Test full flow: start → agent picker → workspace picker → session created
4. **New Session single agent**: Test auto-skip when only 1 agent installed
5. **New Session custom workspace**: Test delegation to AI when "Custom" selected
6. **Settings button**: Test `m:core:settings` → settings keyboard appears
7. **Refresh button**: Test `m:topics` → sessions list refreshed
8. **Intercept map**: Test that intercepted commands skip `registry.execute()`, non-intercepted commands still fall through to core handlers
