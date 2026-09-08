import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * TASK-080C2: Artifact Correspondence Regression Protection
 *
 * Verifies the compiled dist/server bundle contains the corrected parser
 * from TASK-080C1. Prevents stale build output from being packaged.
 *
 * NOTE: This test must run in the Node environment (vitest.node.config.ts)
 * because it reads the filesystem.
 */

const DIST_SERVER_PATH = resolve(__dirname, "..", "..", "..", "dist", "server", "alpha-server.js");

function readDistServer(): string {
  return readFileSync(DIST_SERVER_PATH, "utf-8");
}

describe("TASK-080C2: Compiled server artifact correspondence", () => {
  it("dist/server exists and is non-empty", () => {
    const content = readDistServer();
    expect(content.length).toBeGreaterThan(1000);
  });

  it("contains corrected buffer condition (trimmed.length > 0)", () => {
    const content = readDistServer();
    expect(content).toContain("trimmed.length > 0");
  });

  it("does NOT contain old selective buffer condition", () => {
    const content = readDistServer();
    // The old parser had: trimmed.startsWith("{") || trimmed.startsWith("}")
    expect(content).not.toMatch(/startsWith\("\{"\)\s*\|\|\s*trimmed\.startsWith\("\}"\)/);
  });

  it("contains corrected header regex with ~@ support", () => {
    const content = readDistServer();
    // The corrected regex supports ~ and @ in provider IDs
    expect(content).toMatch(/~@/);
  });
});
