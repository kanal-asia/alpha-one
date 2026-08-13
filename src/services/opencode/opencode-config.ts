import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

/**
 * OpenCode configuration — read and write the *actual* OpenCode config file
 * (JSONC) instead of maintaining a parallel settings store. OpenCode v1.18 has
 * no native `opencode config` command, so configuration is file-based:
 *
 *   1. <workspace>/opencode.json          (project scope)
 *   2. <workspace>/.opencode/opencode.json
 *   3. ~/.config/opencode/opencode.json   (user scope)
 *   4. ~/.local/share/opencode/opencode.json
 *
 * PATCHES are targeted: only whitelisted safe keys are merged into the resolved
 * file; all other existing keys are preserved. Comments in existing JSONC files
 * are not preserved (a documented limitation).
 */

export interface OpenCodeConfigResult {
  resolvedPath: string;
  exists: boolean;
  config: Record<string, unknown>;
}

const SECRET_KEY_PATTERN =
  /(api[_-]?key|secret|token|credential|password|bearer)/i;

function stripJsonComments(source: string): string {
  let result = "";
  let inString = false;
  let inLineComment = false;
  let inBlockComment = false;
  for (let i = 0; i < source.length; i += 1) {
    const c = source[i];
    const next = source[i + 1];
    if (inLineComment) {
      if (c === "\n") {
        inLineComment = false;
        result += c;
      }
      continue;
    }
    if (inBlockComment) {
      if (c === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      result += c;
      if (c === "\\") {
        result += source[i + 1] ?? "";
        i += 1;
      } else if (c === '"') {
        inString = false;
      }
      continue;
    }
    if (c === '"') {
      inString = true;
      result += c;
    } else if (c === "/" && next === "/") {
      inLineComment = true;
      i += 1;
    } else if (c === "/" && next === "*") {
      inBlockComment = true;
      i += 1;
    } else {
      result += c;
    }
  }
  return result;
}

export function candidateConfigPaths(cwd: string): string[] {
  const home = homedir();
  return [
    join(cwd, "opencode.json"),
    join(cwd, ".opencode", "opencode.json"),
    join(home, ".config", "opencode", "opencode.json"),
    join(home, ".local", "share", "opencode", "opencode.json"),
  ];
}

/** Resolve the active config file, or the preferred project path if none exists. */
export function resolveOpenCodeConfigPath(cwd: string): {
  resolvedPath: string;
  exists: boolean;
} {
  for (const candidate of candidateConfigPaths(cwd)) {
    if (existsSync(candidate)) {
      return { resolvedPath: candidate, exists: true };
    }
  }
  return { resolvedPath: candidateConfigPaths(cwd)[0], exists: false };
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SECRET_KEY_PATTERN.test(k) ? "[redacted]" : redact(v);
    }
    return out;
  }
  return value;
}

export function readOpenCodeConfig(cwd: string): OpenCodeConfigResult {
  const { resolvedPath, exists } = resolveOpenCodeConfigPath(cwd);
  if (!exists) {
    return { resolvedPath, exists, config: {} };
  }
  let config: Record<string, unknown> = {};
  try {
    const raw = readFileSync(resolvedPath, "utf8");
    const parsed = JSON.parse(stripJsonComments(raw));
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      config = parsed as Record<string, unknown>;
    }
  } catch {
    config = {};
  }
  return { resolvedPath, exists, config: redact(config) as Record<string, unknown> };
}

/** Keys Alpha Workspace is allowed to write into the real OpenCode config. */
export const SAFE_CONFIG_PATCH_KEYS = ["model"] as const;

function isSafePatchKey(key: string): key is (typeof SAFE_CONFIG_PATCH_KEYS)[number] {
  return (SAFE_CONFIG_PATCH_KEYS as readonly string[]).includes(key);
}

export function patchOpenCodeConfig(
  cwd: string,
  patch: Record<string, unknown>
): OpenCodeConfigResult {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!isSafePatchKey(key)) {
      throw new Error(`Unsupported config key: ${key}`);
    }
    safe[key] = value;
  }

  const { resolvedPath, exists } = resolveOpenCodeConfigPath(cwd);
  let current: Record<string, unknown> = {};
  if (exists) {
    try {
      const parsed = JSON.parse(
        stripJsonComments(readFileSync(resolvedPath, "utf8"))
      );
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        current = parsed as Record<string, unknown>;
      }
    } catch {
      current = {};
    }
  }

  const merged = { ...current, ...safe };
  const output = `${JSON.stringify(merged, null, 2)}\n`;

  if (!exists) {
    mkdirSync(resolveDir(resolvedPath), { recursive: true });
  }
  writeFileSync(resolvedPath, output, "utf8");

  return readOpenCodeConfig(cwd);
}

function resolveDir(filePath: string): string {
  const idx = filePath.lastIndexOf("/");
  const idxWin = filePath.lastIndexOf("\\");
  const cut = Math.max(idx, idxWin);
  return cut > 0 ? filePath.slice(0, cut) : ".";
}