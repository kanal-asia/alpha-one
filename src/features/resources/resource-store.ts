import { create } from 'zustand'
import type { ResourceReference, ResourceProvider, ResourceStore } from './types'
import { KEYS } from '@/lib/storage-keys'

const RESOURCES_KEY = KEYS.RESOURCES

function loadResources(): ResourceReference[] {
  try {
    const raw = localStorage.getItem(RESOURCES_KEY)
    return raw ? (JSON.parse(raw) as ResourceReference[]) : []
  } catch {
    return []
  }
}

function saveResources(resources: ResourceReference[]) {
  try {
    localStorage.setItem(RESOURCES_KEY, JSON.stringify(resources))
  } catch {
    /* ignore */
  }
}

function newId() {
  return `res-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
}

/** Canonical identity key for deduplication. */
function identityKey(provider: ResourceProvider, externalId: string): string {
  return `${provider}:${externalId}`
}

export const useResourceStore = create<ResourceStore>((set, get) => ({
  resources: loadResources(),

  addResource: (ref) => {
    const resource: ResourceReference = {
      ...ref,
      id: newId(),
      registeredAt: new Date().toISOString(),
    }
    set((state) => {
      const resources = [...state.resources, resource]
      saveResources(resources)
      return { resources }
    })
    return resource
  },

  upsertResource: (ref) => {
    const key = identityKey(ref.provider, ref.externalId)
    const existing = get().resources.find(
      (r) => identityKey(r.provider, r.externalId) === key
    )
    if (existing) {
      const resource: ResourceReference = {
        ...existing,
        ...ref,
        id: existing.id,
        registeredAt: existing.registeredAt,
        lastModified: ref.lastModified ?? existing.lastModified,
      }
      set((state) => {
        const resources = state.resources.map((r) =>
          r.id === existing.id ? resource : r
        )
        saveResources(resources)
        return { resources }
      })
      return resource
    }
    return get().addResource(ref)
  },

  removeResource: (id) => {
    set((state) => {
      const resources = state.resources.filter((r) => r.id !== id)
      saveResources(resources)
      return { resources }
    })
  },

  findResource: (provider, externalId) => {
    const key = identityKey(provider, externalId)
    return get().resources.find(
      (r) => identityKey(r.provider, r.externalId) === key
    )
  },
}))
