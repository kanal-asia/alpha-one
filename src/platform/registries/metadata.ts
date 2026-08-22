/**
 * Alpha Workspace ΓÇö Metadata Registries (Platform Kernel, TASK-ENGINEERING-001)
 *
 * SDK / Entity / Config registries are contract metadata stores. They document
 * what is available in the platform and are exposed to the UI (e.g. to render
 * the available SDKs and workflow definitions) without coupling the UI to any
 * implementation.
 */

export interface SdkDescriptor {
  id: string
  name: string
  description: string
  version: string
  /** Operation ids the SDK registers. */
  operations: string[]
}

export interface SdkRegistry {
  register(descriptor: SdkDescriptor): void
  list(): SdkDescriptor[]
  get(id: string): SdkDescriptor | null
}

export function createSdkRegistry(): SdkRegistry {
  const sdks = new Map<string, SdkDescriptor>()
  return {
    register(d) {
      sdks.set(d.id, d)
    },
    list() {
      return [...sdks.values()]
    },
    get(id) {
      return sdks.get(id) ?? null
    },
  }
}

export interface EntityDescriptor {
  id: string
  name: string
  description: string
}

export interface EntityRegistry {
  register(d: EntityDescriptor): void
  list(): EntityDescriptor[]
}

export function createEntityRegistry(): EntityRegistry {
  const entities: EntityDescriptor[] = []
  return {
    register(d) {
      entities.push(d)
    },
    list() {
      return [...entities]
    },
  }
}

export interface ConfigRegistry {
  get(key: string): string | undefined
  set(key: string, value: string): void
  entries(): Array<{ key: string; value: string }>
}

export function createConfigRegistry(): ConfigRegistry {
  const map = new Map<string, string>()
  return {
    get(key) {
      return map.get(key)
    },
    set(key, value) {
      map.set(key, value)
    },
    entries() {
      return [...map.entries()].map(([key, value]) => ({ key, value }))
    },
  }
}
