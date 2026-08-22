/**
 * Alpha Workspace ΓÇö Local file storage adapter (server only)
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import type { ArtifactStorage } from '../artifacts/storage'

export function createLocalStorage(rootDir: string): ArtifactStorage {
  const root = resolve(rootDir)
  return {
    location: root,
    async write(key, bytes) {
      const file = join(root, key)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, bytes)
    },
    async read(key) {
      return new Uint8Array(await readFile(join(root, key)))
    },
    async remove(key) {
      const file = join(root, key)
      await writeFile(file, new Uint8Array(0))
    },
    async has(key) {
      try {
        await readFile(join(root, key))
        return true
      } catch {
        return false
      }
    },
  }
}
