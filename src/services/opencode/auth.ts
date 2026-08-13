import { spawn } from "node:child_process";
import { resolveOpenCode } from "./client";

/**
 * OpenCode-managed provider authentication.
 *
 * Alpha Workspace reuses OpenCode's own credential store and auth commands
 * (`opencode auth login|logout`) instead of maintaining a parallel credential
 * system. Credentials live in `~/.local/share/opencode/auth.json` and are
 * managed exclusively by the OpenCode CLI.
 */

export interface OpenCodeAuthResult {
  ok: boolean;
  command: string;
  output: string;
  timedOut: boolean;
}

function runAuth(args: string[], timeoutMs: number): Promise<OpenCodeAuthResult> {
  const resolved = resolveOpenCode();
  const command = `opencode auth ${args.join(" ")}`;
  if (!resolved) {
    return Promise.resolve({
      ok: false,
      command,
      output: "OpenCode CLI not found. Install with: npm i -g opencode-ai",
      timedOut: false,
    });
  }

  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const child = spawn(resolved.command, [...resolved.prefixArgs, "auth", ...args], {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      shell: false,
      detached: false,
      env: { ...process.env, OPENCODE_NO_TUI: "1", CI: "1", NO_COLOR: "1" },
    });

    child.stdout?.on("data", (d) => {
      stdout += d.toString();
    });
    child.stderr?.on("data", (d) => {
      stderr += d.toString();
    });

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGKILL");
      const output = (stdout + stderr).trim();
      resolve({
        ok: false,
        command,
        output: output || "Timed out while waiting for the interactive login flow.",
        timedOut: true,
      });
    }, timeoutMs);

    child.on("error", () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok: false, command, output: stderr.trim() || "Failed to launch OpenCode.", timedOut: false });
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const output = (stdout + stderr).trim();
      resolve({ ok: code === 0, command, output, timedOut: false });
    });
  });
}

/**
 * Attempt OpenCode's own provider login.
 *
 * NOTE: `opencode auth login` performs an interactive OAuth flow that requires
 * a terminal/browser. The headless runtime cannot complete it in-process; the
 * returned result surfaces the exact blocker plus the command the user should
 * run in their own terminal. It never fabricates success.
 */
export async function openCodeAuthLogin(providerId: string): Promise<OpenCodeAuthResult> {
  return runAuth(["login", "--provider", providerId], 15_000);
}

/** Log out from an OpenCode-managed provider (non-interactive). */
export async function openCodeAuthLogout(providerId: string): Promise<OpenCodeAuthResult> {
  return runAuth(["logout", providerId], 15_000);
}