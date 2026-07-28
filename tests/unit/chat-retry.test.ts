import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRetryConversation,
  isPersistedAiErrorMessage,
  resolveRetryUserMessageIndex
} from '../../src/renderer/src/lib/chat-retry'

test('detects persisted AI error messages', () => {
  assert.equal(
    isPersistedAiErrorMessage({
      role: 'model',
      content: 'The AI service lost connection or timed out. Check your network and try again.'
    }),
    true
  )
})

test('ignores stale retryUserMessageIndex after history truncation', () => {
  const messages = [
    { role: 'user' as const, content: 'hello' },
    { role: 'model' as const, content: 'The AI service lost connection or timed out.', retryUserMessageIndex: 99 }
  ]

  assert.equal(resolveRetryUserMessageIndex(messages, 1), 0)
})

test('builds a conversation ending on the retried user message', () => {
  const messages = [
    { role: 'user' as const, content: 'first' },
    { role: 'model' as const, content: 'ok' },
    { role: 'user' as const, content: 'retry me' },
    { role: 'model' as const, content: 'The AI service lost connection or timed out.', isError: true }
  ]

  assert.deepEqual(buildRetryConversation(messages, 2), [
    { role: 'user', content: 'first' },
    { role: 'model', content: 'ok' },
    { role: 'user', content: 'retry me' }
  ])
})
