import { create } from 'zustand'
import type { SkillDefinition } from './types'
import { KEYS } from '@/lib/storage-keys'

const CUSTOM_SKILLS_KEY = KEYS.CUSTOM_SKILLS

// ── Built-in skills (canonical definitions, not user-editable) ──────────────

const BUILTIN_SKILLS: SkillDefinition[] = [
  {
    id: 'builtin-sheet',
    command: '/sheet',
    displayName: 'Google Sheets',
    description: 'Create or work with Google Sheets data',
    category: 'Google Workspace',
    promptTemplate:
      'I need help with Google Sheets. Please create or edit a spreadsheet using the Google Sheets API. Use the authenticated Google account.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'builtin-docs',
    command: '/docs',
    displayName: 'Google Docs',
    description: 'Create or edit Google Documents',
    category: 'Google Workspace',
    promptTemplate:
      'I need help with Google Docs. Please create or edit a document using the Google Docs API. Use the authenticated Google account.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'builtin-slides',
    command: '/slides',
    displayName: 'Google Slides',
    description: 'Build or modify Google Slides presentations',
    category: 'Google Workspace',
    promptTemplate:
      'I need help with Google Slides. Please create or edit a presentation using the Google Slides API. Use the authenticated Google account.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'builtin-mail',
    command: '/mail',
    displayName: 'Gmail',
    description: 'Draft or send email via Gmail',
    category: 'Google Workspace',
    promptTemplate:
      'I need help with Gmail. Please draft or send an email using the Gmail API. Use the authenticated Google account.',
    enabled: true,
    source: 'builtin',
  },
  {
    id: 'builtin-schedule',
    command: '/schedule',
    displayName: 'Google Calendar',
    description: 'Create or manage calendar events',
    category: 'Google Workspace',
    promptTemplate:
      'I need help with Google Calendar. Please create or manage calendar events using the Google Calendar API. Use the authenticated Google account.',
    enabled: true,
    source: 'builtin',
  },
]

// ── localStorage helpers ────────────────────────────────────────────────────

function loadCustomSkills(): SkillDefinition[] {
  try {
    const raw = localStorage.getItem(CUSTOM_SKILLS_KEY)
    return raw ? (JSON.parse(raw) as SkillDefinition[]) : []
  } catch {
    return []
  }
}

function saveCustomSkills(skills: SkillDefinition[]) {
  try {
    localStorage.setItem(CUSTOM_SKILLS_KEY, JSON.stringify(skills))
  } catch {
    /* ignore */
  }
}

// ── Command validation ──────────────────────────────────────────────────────

const COMMAND_REGEX = /^\/[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidCommand(command: string): boolean {
  return COMMAND_REGEX.test(command)
}

// ── Store ───────────────────────────────────────────────────────────────────

export interface SkillStore {
  /** All enabled built-in skills. */
  builtinSkills: SkillDefinition[]
  /** User-created custom skills (persisted). */
  customSkills: SkillDefinition[]
  /** All enabled skills (builtin + custom). */
  allSkills: SkillDefinition[]
  /** Add a custom skill. Returns the created skill, or undefined if command conflicts. */
  addSkill: (
    skill: Omit<SkillDefinition, 'id' | 'source' | 'createdAt' | 'updatedAt'>
  ) => SkillDefinition | undefined
  /** Update a custom skill. Returns the updated skill, or undefined if not found or command conflicts. */
  updateSkill: (
    id: string,
    patch: Partial<
      Pick<SkillDefinition, 'command' | 'displayName' | 'description' | 'promptTemplate'>
    >
  ) => SkillDefinition | undefined
  /** Delete a custom skill by id. */
  deleteSkill: (id: string) => void
  /** Resolve a skill by command string. */
  resolveSkill: (command: string) => SkillDefinition | undefined
  /** Filter all enabled skills by query. */
  filterSkills: (query: string) => SkillDefinition[]
}

function rebuildAll(builtin: SkillDefinition[], custom: SkillDefinition[]): SkillDefinition[] {
  return [...builtin, ...custom].filter((s) => s.enabled)
}

const customSkillsSnapshot = loadCustomSkills()

export const useSkillStore = create<SkillStore>((set, get) => ({
  builtinSkills: BUILTIN_SKILLS,
  customSkills: customSkillsSnapshot,
  allSkills: rebuildAll(BUILTIN_SKILLS, customSkillsSnapshot),

  addSkill: (skill) => {
    const { builtinSkills, customSkills } = get()
    const allCommands = [...builtinSkills, ...customSkills].map((s) => s.command)
    if (allCommands.includes(skill.command)) return undefined

    const now = new Date().toISOString()
    const newSkill: SkillDefinition = {
      ...skill,
      id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      source: 'custom',
      createdAt: now,
      updatedAt: now,
    }

    const updatedCustom = [...customSkills, newSkill]
    saveCustomSkills(updatedCustom)
    set({
      customSkills: updatedCustom,
      allSkills: rebuildAll(builtinSkills, updatedCustom),
    })
    return newSkill
  },

  updateSkill: (id, patch) => {
    const { builtinSkills, customSkills } = get()
    const existing = customSkills.find((s) => s.id === id)
    if (!existing) return undefined

    // If command changed, check uniqueness
    if (patch.command && patch.command !== existing.command) {
      const allCommands = [...builtinSkills, ...customSkills].map((s) => s.command)
      if (allCommands.includes(patch.command)) return undefined
    }

    const updated: SkillDefinition = {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    }

    const updatedCustom = customSkills.map((s) => (s.id === id ? updated : s))
    saveCustomSkills(updatedCustom)
    set({
      customSkills: updatedCustom,
      allSkills: rebuildAll(builtinSkills, updatedCustom),
    })
    return updated
  },

  deleteSkill: (id) => {
    const { builtinSkills, customSkills } = get()
    const updatedCustom = customSkills.filter((s) => s.id !== id)
    saveCustomSkills(updatedCustom)
    set({
      customSkills: updatedCustom,
      allSkills: rebuildAll(builtinSkills, updatedCustom),
    })
  },

  resolveSkill: (command) => {
    return get().allSkills.find((s) => s.enabled && s.command === command)
  },

  filterSkills: (query) => {
    const q = query.toLowerCase().trim()
    const enabled = get().allSkills.filter((s) => s.enabled)
    if (!q) return enabled
    return enabled.filter(
      (s) =>
        s.command.toLowerCase().includes(q) ||
        s.displayName.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    )
  },
}))

/** Standalone filter function — delegates to the canonical skill store. */
export function filterSkills(query: string): SkillDefinition[] {
  return useSkillStore.getState().filterSkills(query)
}
