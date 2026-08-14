import { type ToolConfig, type ToolExecution } from './types'

const CONFIG_KEY = 'alpha-workspace:tool-config'
const HISTORY_KEY = 'alpha-workspace:tool-history'

type ConfigOverrides = Record<string, Partial<ToolConfig>>

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // ignore quota / serialization errors
  }
}

export function loadConfigOverrides(): ConfigOverrides {
  return readJSON<ConfigOverrides>(CONFIG_KEY, {})
}

export function saveConfigOverrides(overrides: ConfigOverrides) {
  writeJSON(CONFIG_KEY, overrides)
}

export function loadHistory(): ToolExecution[] {
  return readJSON<ToolExecution[]>(HISTORY_KEY, [])
}

export function saveHistory(history: ToolExecution[]) {
  // Keep most recent 50 executions to bound storage.
  writeJSON(HISTORY_KEY, history.slice(0, 50))
}
