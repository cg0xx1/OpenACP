# Critical Fixes for Issue #21 — Design Spec

**Date:** 2026-03-23
**Issue:** [#21 — PR #19 Code Review: Issues to address](https://github.com/Open-ACP/OpenACP/issues/21)
**Scope:** 4 Critical items only

---

## Overview

This spec addresses the 4 critical issues identified during the PR #19 code review. Each fix is independent and can be implemented and tested in isolation.

---

## Fix 1: API Server Authentication

**Problem:** `api-server.ts` exposes HTTP routes (create session, toggle dangerous mode, restart daemon, modify config) with no authentication. Any local process can call them.

**Design:**

1. **Token generation:** On first API server start, generate a 32-byte random hex token using `crypto.randomBytes(32).toString('hex')`.
2. **Storage:** Write to `~/.openacp/api-secret` with file permission `0600`. If the file already exists, read and reuse the existing token.
3. **Validation:** Add an `authenticate()` method to `APIServer` that extracts the token from the `Authorization: Bearer <token>` header and compares it against the stored secret. Called at the top of `handleRequest()` before any routing.
4. **Rejection:** Return `401 Unauthorized` with `{ error: "Unauthorized" }` for missing or invalid tokens.
5. **Client integration:** Runtime CLI commands (`openacp runtime ...`) read the token from `~/.openacp/api-secret` and attach it as an `Authorization` header when calling the API.

**Files changed:**
- `src/core/api-server.ts` — add auth middleware
- Runtime CLI code that calls the API — add auth header

**Edge cases:**
- If `api-secret` file is missing when CLI tries to read it, print a clear error ("Daemon not running or API secret not found").
- Token file created with `0600` permissions so only the owning user can read it.

---

## Fix 2: XML/Systemd Injection in autostart.ts

**Problem:** `nodePath`, `cliPath`, and `logFile` are interpolated directly into plist XML and systemd unit strings. Special characters in paths can break syntax or enable injection.

**Design:**

1. **`escapeXml(str)`** — Escapes `&`, `<`, `>`, `"`, `'` for safe insertion into XML `<string>` elements.
2. **`escapeSystemdExecStart(str)`** — Wraps the value in quotes and escapes embedded quotes/backslashes per systemd exec syntax.
3. **Apply escaping** to all interpolated values in `generateLaunchdPlist()` and `generateSystemdUnit()`.

**Files changed:**
- `src/core/autostart.ts` — add escape helpers, apply to template literals

**Validation:** Paths with spaces, quotes, ampersands, and angle brackets must produce valid XML/unit files.

---

## Fix 3: Unused `createRequire` Import

**Problem:** `cli/version.ts` imports `createRequire` from `node:module` but never uses it. The original issue reported that `getCurrentVersion()` uses `require()` in ESM, but the code has already been fixed to use `readFileSync`. Only the dead import remains.

**Design:** Remove the unused `import { createRequire } from 'node:module'` line.

**Files changed:**
- `src/cli/version.ts` — remove unused import

---

## Fix 4: PID File Race Condition in stopDaemon

**Problem:** `stopDaemon()` in `daemon.ts` sends `SIGTERM` then immediately removes the PID file without waiting for the process to exit. If the child hasn't exited yet, the system loses track of it.

**Design:**

1. **Make `stopDaemon()` async.**
2. **After sending `SIGTERM`, poll `process.kill(pid, 0)` every 100ms** to check if the process is still alive.
3. **Timeout after 5 seconds.** If the process hasn't exited, send `SIGKILL`, wait another 1 second, then remove the PID file.
4. **Only remove PID file after confirmed exit** (or after SIGKILL timeout).
5. **Update all callers** of `stopDaemon()` to `await` the result.

**Files changed:**
- `src/core/daemon.ts` — make `stopDaemon` async, add polling logic
- Callers of `stopDaemon()` — add `await`

---

## Testing Strategy

- **Fix 1:** Unit test that requests without auth header get 401; requests with correct token succeed.
- **Fix 2:** Unit test that `escapeXml` and `escapeSystemdExecStart` produce correct output for paths with special characters. Verify generated plist/unit are well-formed.
- **Fix 3:** No test needed — just removing an import.
- **Fix 4:** Unit test that `stopDaemon` waits for process exit before removing PID file. Mock `process.kill` to simulate delayed exit.

---

## Out of Scope

All non-critical items from issue #21 (Major, Minor, Tests, Housekeeping) are deferred to a separate spec.
