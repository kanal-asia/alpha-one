/**
 * TASK-ALPHA-LOCAL-080C3R2: in-memory localStorage shim for non-browser
 * execution of the refresh-feedback store tests. Browser runs already
 * provide localStorage; this only installs a stub when it is missing
 * (node environment), before opencode-store module init runs.
 */
if (typeof globalThis.localStorage === 'undefined') {
  const mem = new Map<string, string>()
  const stub = {
    getItem: (k: string): string | null => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string): void => {
      mem.set(k, String(v))
    },
    removeItem: (k: string): void => {
      mem.delete(k)
    },
    clear: (): void => {
      mem.clear()
    },
    key: (i: number): string | null => [...mem.keys()][i] ?? null,
    get length(): number {
      return mem.size
    },
  }
  Object.defineProperty(globalThis, 'localStorage', {
    value: stub,
    writable: true,
    configurable: true,
  })
}

export {}
