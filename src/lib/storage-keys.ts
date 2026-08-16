/**
 * TASK-OPENCODE-036: Centralized localStorage key registry
 *
 * All Alpha One localStorage keys are defined here as the single source of truth.
 * The old `alpha-workspace:*` namespace is migrated to `alpha-one:*`.
 *
 * Migration strategy: On load, each store checks for old keys and migrates data.
 */

/** Current (canonical) namespace prefix */
export const NAMESPACE = 'alpha-one' as const

/** All localStorage keys used by Alpha One */
export const KEYS = {
  /** OpenCode chat history (max 50 chats) */
  CHATS: `${NAMESPACE}:opencode-chats`,
  /** OpenCode UI settings (workspace path, model, mode, developer mode) */
  SETTINGS: `${NAMESPACE}:opencode-settings`,
  /** Model favorites + last-used model */
  MODEL_PREFS: `${NAMESPACE}:model-preferences`,
  /** Tool configuration overrides */
  TOOL_CONFIG: `${NAMESPACE}:tool-config`,
  /** Tool execution history (max 50 entries) */
  TOOL_HISTORY: `${NAMESPACE}:tool-history`,
  /** Project definitions */
  PROJECTS: `${NAMESPACE}:projects`,
  /** Currently active project ID */
  ACTIVE_PROJECT: `${NAMESPACE}:active-project`,
  /** Resource references (file metadata) */
  RESOURCES: `${NAMESPACE}:resources`,
  /** User-created custom skills */
  CUSTOM_SKILLS: `${NAMESPACE}:custom-skills`,
  /** Sidebar nav group collapsed state */
  SIDEBAR_COLLAPSED: `${NAMESPACE}:sidebar-collapsed`,
} as const

/** Legacy (old) namespace prefix for migration */
export const LEGACY_NAMESPACE = 'alpha-workspace' as const

/** Legacy keys mapping: old key → new key */
export const LEGACY_KEY_MAP: Record<string, string> = {
  [`${LEGACY_NAMESPACE}:opencode-chats`]: KEYS.CHATS,
  [`${LEGACY_NAMESPACE}:opencode-settings`]: KEYS.SETTINGS,
  [`${LEGACY_NAMESPACE}:model-preferences`]: KEYS.MODEL_PREFS,
  [`${LEGACY_NAMESPACE}:tool-config`]: KEYS.TOOL_CONFIG,
  [`${LEGACY_NAMESPACE}:tool-history`]: KEYS.TOOL_HISTORY,
  [`${LEGACY_NAMESPACE}:projects`]: KEYS.PROJECTS,
  [`${LEGACY_NAMESPACE}:active-project`]: KEYS.ACTIVE_PROJECT,
  [`${LEGACY_NAMESPACE}:resources`]: KEYS.RESOURCES,
  [`${LEGACY_NAMESPACE}:custom-skills`]: KEYS.CUSTOM_SKILLS,
  [`${LEGACY_NAMESPACE}:sidebar-collapsed`]: KEYS.SIDEBAR_COLLAPSED,
  // Stale key that was never correct but exists in clearLocalCache()
  [`${LEGACY_NAMESPACE}:opencode-model-prefs`]: KEYS.MODEL_PREFS,
}

/**
 * Migrate a single localStorage key from legacy to current namespace.
 * Returns the current value (from new key if it exists, otherwise migrated from old key).
 */
export function migrateKey(key: string): string | null {
  const newKey = LEGACY_KEY_MAP[key] ?? key
  const currentVal = localStorage.getItem(newKey)
  if (currentVal !== null) return currentVal

  const oldVal = localStorage.getItem(key)
  if (oldVal !== null && key !== newKey) {
    localStorage.setItem(newKey, oldVal)
    localStorage.removeItem(key)
    return oldVal
  }
  return null
}

/**
 * Run full localStorage migration from alpha-workspace → alpha-one namespace.
 * Safe to call multiple times (idempotent).
 */
export function migrateAllKeys(): void {
  for (const oldKey of Object.keys(LEGACY_KEY_MAP)) {
    migrateKey(oldKey)
  }
}
