import type { AssetsPort } from '../../src/server/ingest/pdf'

export function createMemoryAssets(): AssetsPort {
  const store = new Map<string, Uint8Array>()
  return {
    async put(key, bytes) {
      store.set(key, Uint8Array.from(bytes))
    },
    async get(key) {
      const value = store.get(key)
      return value ? Uint8Array.from(value) : null
    },
    async delete(key) {
      store.delete(key)
    },
  }
}
