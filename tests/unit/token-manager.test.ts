import test from 'node:test'
import assert from 'node:assert/strict'
import { tokenManager } from '../../src/renderer/src/lib/auth/token-manager'

const createStorage = () => {
  const store = new Map<string, string>()
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value)
    },
    removeItem: (key: string) => {
      store.delete(key)
    },
    clear: () => {
      store.clear()
    }
  }
}

test.beforeEach(() => {
  const sessionStorage = createStorage()
  Object.defineProperty(globalThis, 'window', {
    value: {
      sessionStorage,
      atob: (value: string) => Buffer.from(value, 'base64').toString('utf8')
    },
    configurable: true
  })
})

test('token manager stores and retrieves token + user', () => {
  tokenManager.setToken('plain-token')
  tokenManager.setUser({ login: 'atikur', name: 'Atikur' })

  assert.equal(tokenManager.getToken(), 'plain-token')
  assert.deepEqual(tokenManager.getUser(), { login: 'atikur', name: 'Atikur' })
  assert.equal(tokenManager.isExpired(), false)
})

test('token manager clears token and user', () => {
  tokenManager.setToken('plain-token')
  tokenManager.setUser({ login: 'atikur' })

  tokenManager.clearToken()
  tokenManager.setUser(null)

  assert.equal(tokenManager.getToken(), null)
  assert.equal(tokenManager.getUser(), null)
})
