import { createJSONStorage, type StateStorage } from 'zustand/middleware'

const memory = new Map<string, string>()

const fallbackStorage: StateStorage = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, value)
  },
  removeItem: (key) => {
    memory.delete(key)
  }
}

const appStorage: StateStorage = {
  getItem: (key) => window.api?.appStorage?.getItem(key) ?? fallbackStorage.getItem(key),
  setItem: (key, value) => window.api?.appStorage?.setItem(key, value) ?? fallbackStorage.setItem(key, value),
  removeItem: (key) => window.api?.appStorage?.removeItem(key) ?? fallbackStorage.removeItem(key)
}

export const appPersistStorage = createJSONStorage(() => appStorage)
