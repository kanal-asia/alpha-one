import type { SkillDefinition } from './types'
import { useSkillStore } from './skill-store'

/**
 * Legacy API — delegates to the Zustand skill store.
 *
 * These functions exist for backward compatibility with components that
 * import directly from this module. Prefer `useSkillStore` in new code.
 */

export function getSkills(): SkillDefinition[] {
  return useSkillStore.getState().allSkills.filter((s) => s.enabled)
}

export function resolveSkill(command: string): SkillDefinition | undefined {
  return useSkillStore.getState().resolveSkill(command)
}

export function filterSkills(query: string): SkillDefinition[] {
  return useSkillStore.getState().filterSkills(query)
}
