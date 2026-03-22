import { execFileSync } from "node:child_process";
import type { AvailabilityResult } from "./types.js";

export interface AgentDependency {
  command: string;
  label: string;
  installHint: string;
}

export interface AgentCapability {
  supportsResume: boolean;
  resumeCommand?: (sessionId: string) => string;
}

const AGENT_DEPENDENCIES: Record<string, AgentDependency[]> = {
  "claude-acp": [
    {
      command: "claude",
      label: "Claude CLI",
      installHint: "npm install -g @anthropic-ai/claude-code",
    },
  ],
  "codex-acp": [
    {
      command: "codex",
      label: "Codex CLI",
      installHint: "npm install -g @openai/codex",
    },
  ],
};

const AGENT_CAPABILITIES: Record<string, AgentCapability> = {
  claude: {
    supportsResume: true,
    resumeCommand: (sid) => `claude --resume ${sid}`,
  },
};

export const REGISTRY_AGENT_ALIASES: Record<string, string> = {
  "claude-acp": "claude",
  "codex-acp": "codex",
  "gemini": "gemini",
  "cursor": "cursor",
  "github-copilot-cli": "copilot",
  "cline": "cline",
  "goose": "goose",
  "kilo": "kilo",
  "qwen-code": "qwen",
};

export function getAgentAlias(registryId: string): string {
  return REGISTRY_AGENT_ALIASES[registryId] ?? registryId;
}

export function getAgentDependencies(registryId: string): AgentDependency[] {
  return AGENT_DEPENDENCIES[registryId] ?? [];
}

export function getAgentCapabilities(agentName: string): AgentCapability {
  return AGENT_CAPABILITIES[agentName] ?? { supportsResume: false };
}

function commandExists(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

export function checkDependencies(registryId: string): AvailabilityResult {
  const deps = getAgentDependencies(registryId);
  if (deps.length === 0) return { available: true };

  const missing = deps.filter((d) => !commandExists(d.command));
  if (missing.length === 0) return { available: true };

  return {
    available: false,
    reason: `Requires: ${missing.map((m) => m.label).join(", ")}`,
    missing: missing.map((m) => ({ label: m.label, installHint: m.installHint })),
  };
}

export function checkRuntimeAvailable(runtime: "npx" | "uvx"): boolean {
  return commandExists(runtime);
}
