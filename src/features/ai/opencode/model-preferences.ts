import { KEYS } from '@/lib/storage-keys'

const PREFS_KEY = KEYS.MODEL_PREFS

export interface ModelPreferences {
  favorites: string[]
  lastUsed: string | null
}

export function loadModelPreferences(): ModelPreferences {
  try {
    const raw = localStorage.getItem(PREFS_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ModelPreferences>
      return {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        lastUsed: typeof parsed.lastUsed === 'string' ? parsed.lastUsed : null,
      }
    }
  } catch {
    /* ignore */
  }
  return { favorites: [], lastUsed: null }
}

function save(prefs: ModelPreferences) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export function isFavorite(id: string): boolean {
  return loadModelPreferences().favorites.includes(id)
}

export function toggleFavorite(id: string): ModelPreferences {
  const prefs = loadModelPreferences()
  const favorites = prefs.favorites.includes(id)
    ? prefs.favorites.filter((f) => f !== id)
    : [...prefs.favorites, id]
  save({ ...prefs, favorites })
  return { ...prefs, favorites }
}

export function markModelUsed(id: string): void {
  const prefs = loadModelPreferences()
  save({ ...prefs, lastUsed: id })
}
