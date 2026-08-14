/**
 * Skill definition — a structured prompt/capability that can be triggered via `/`.
 *
 * Skills are registered once and resolved into prompt templates at runtime.
 * The registry is extensible without modifying the composer component.
 */

export interface SkillDefinition {
  /** Stable unique identifier. */
  id: string
  /** Slash command (e.g., `/sheet`). Must start with `/`, lowercase alphanumeric + hyphens. */
  command: string
  /** Display name for the palette. */
  displayName: string
  /** Short description shown in the palette. */
  description: string
  /** Category for grouping in the palette. */
  category: string
  /** Prompt template sent to the agent when the skill is selected. */
  promptTemplate: string
  /** Whether this skill is currently enabled. */
  enabled: boolean
  /** Whether this is a built-in or user-created skill. */
  source: 'builtin' | 'custom'
  /** ISO timestamp when this skill was created (custom skills only). */
  createdAt?: string
  /** ISO timestamp when this skill was last updated (custom skills only). */
  updatedAt?: string
}

export interface SkillRegistry {
  skills: SkillDefinition[]
  resolve: (command: string) => SkillDefinition | undefined
  filter: (query: string) => SkillDefinition[]
}
