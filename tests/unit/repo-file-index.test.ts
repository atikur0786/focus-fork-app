import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveEditPathAgainstIndex } from '../../src/renderer/src/lib/repo-file-index'

const index = [
  'sdk/src/utils/crypto.ts',
  'README.md',
  'hardhat.config.js'
]

test('keeps exact paths from the index', () => {
  assert.equal(resolveEditPathAgainstIndex('sdk/src/utils/crypto.ts', index), 'sdk/src/utils/crypto.ts')
})

test('maps guessed src/crypto.ts to the real sdk path', () => {
  assert.equal(resolveEditPathAgainstIndex('src/crypto.ts', index), 'sdk/src/utils/crypto.ts')
})

test('maps basename-only crypto.ts when unique', () => {
  assert.equal(resolveEditPathAgainstIndex('crypto.ts', index), 'sdk/src/utils/crypto.ts')
})
