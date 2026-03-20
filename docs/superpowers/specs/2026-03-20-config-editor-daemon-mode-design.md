# Design: CLI Config Editor & Daemon Mode

## Overview

Two features for OpenACP:
1. **`openacp config`** — Menu-based interactive config editor
2. **Daemon mode** — Background execution with auto-start on boot, chosen during onboarding

## Config Schema Changes

Add to `ConfigSchema`:

```typescript
runMode: z.enum(['foreground', 'daemon']).default('foreground')
autoStart: z.boolean().default(false)
```

- `runMode: 'daemon'` — `openacp` spawns a background process and exits
- `autoStart: true` — installs OS-level auto-start (LaunchAgent on macOS, systemd on Linux)
- Env override: `OPENACP_RUN_MODE`

## CLI Commands

| Command | Description |
|---|---|
| `openacp` (no args) | Reads `runMode` from config. `foreground` → runs server directly. `daemon` → spawns detached child and exits. |
| `openacp start` | Force daemon mode (regardless of config) |
| `openacp stop` | Reads PID from `~/.openacp/openacp.pid`, sends SIGTERM |
| `openacp status` | Checks PID file, reports running/stopped |
| `openacp logs` | Tails `~/.openacp/logs/openacp.log` |
| `openacp config` | Menu-based config editor |
| `openacp --foreground` | Force foreground (overrides `runMode: daemon`) |
| `openacp --daemon-child` | Internal flag — actual server process spawned by daemon mode |

### Daemon Spawn Logic

1. Check `~/.openacp/openacp.pid` — if process alive, print "Already running (PID xxx)" and exit
2. Spawn `node <cli-path> --daemon-child` with `{ detached: true, stdio: 'ignore' }`
3. Write child PID to `~/.openacp/openacp.pid`
4. Parent exits immediately

### `--daemon-child` Behavior

- Redirects stdout/stderr to `~/.openacp/logs/openacp.log`
- Writes own PID to `~/.openacp/openacp.pid`
- Runs `startServer()` as normal
- On shutdown (SIGTERM): removes PID file

## Menu-based Config Editor

### Flow

```
openacp config
  → Main menu:
    ❯ Telegram
      Agent
      Workspace
      Security
      Logging
      Run Mode
      ← Exit
```

Selecting a group shows current values and edit options:

```
[Telegram]
  Bot Token: sk-xxx...xxx
  Chat ID: -1001234567890

  ❯ Change Bot Token
    Change Chat ID
    ← Back
```

### Edit Behavior

- Shows current value as default
- Enter to keep current, or type new value
- Validates same as setup (bot token → API check, chat ID → supergroup check)
- After editing a field → returns to group menu
- Back → returns to main menu
- Exit → saves config to disk

### Run Mode Submenu

```
[Run Mode]
  Current: foreground
  Auto-start: off

  ❯ Switch to daemon
    ← Back
```

- "Switch to daemon" → sets `runMode: 'daemon'`, `autoStart: true`, installs OS service
- "Switch to foreground" → sets `runMode: 'foreground'`, `autoStart: false`, removes OS service

## Auto-start on Boot

### macOS (LaunchAgent)

File: `~/Library/LaunchAgents/com.openacp.daemon.plist`

```xml
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.openacp.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/node</string>
    <string>/path/to/openacp/cli.js</string>
    <string>--daemon-child</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>~/.openacp/logs/openacp.log</string>
  <key>StandardErrorPath</key>
  <string>~/.openacp/logs/openacp.log</string>
</dict>
</plist>
```

- Install: `launchctl load <plist>`
- Uninstall: `launchctl unload <plist>` + delete file

### Linux (systemd user service)

File: `~/.config/systemd/user/openacp.service`

```ini
[Unit]
Description=OpenACP Daemon

[Service]
ExecStart=/path/to/node /path/to/openacp/cli.js --daemon-child
Restart=on-failure

[Install]
WantedBy=default.target
```

- Install: `systemctl --user daemon-reload && systemctl --user enable openacp`
- Uninstall: `systemctl --user disable openacp` + delete file

### Platform Detection

`process.platform === 'darwin'` → launchd, `'linux'` → systemd.

## Onboarding Changes

Add step 4 after Workspace:

```
[4/4] Run Mode

  How would you like to run OpenACP?

  ❯ Background (daemon)
    Runs silently, auto-starts on boot.
    Manage with: openacp status | stop | logs

    Foreground (terminal)
    Runs in current terminal session.
    Start with: openacp
```

- **Background** → `runMode: 'daemon'`, `autoStart: true` → install OS service → spawn daemon → print "OpenACP is running in background (PID xxx)"
- **Foreground** → `runMode: 'foreground'`, `autoStart: false` → start server directly (current behavior)

Step numbering updates: `[1/4] Telegram`, `[2/4] Agent` (now explicitly shown), `[3/4] Workspace`, `[4/4] Run Mode`.

## New Files

| File | Purpose |
|---|---|
| `src/core/daemon.ts` | Spawn logic, PID management, start/stop/status |
| `src/core/autostart.ts` | LaunchAgent/systemd install/uninstall |
| `src/core/config-editor.ts` | Menu-based config editor |

## Dependencies

No new dependencies. Uses existing `@inquirer/prompts` and Node.js built-ins (`child_process`, `fs`).
