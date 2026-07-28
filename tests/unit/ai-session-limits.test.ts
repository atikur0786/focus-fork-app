import test from 'node:test'
import assert from 'node:assert/strict'
import { getComposerLimitState } from '../../src/renderer/src/lib/ai-session-limits'

test('blocks composer when backend session is missing', () => {
  const state = getComposerLimitState([
    { role: 'user', content: 'hello' },
    { role: 'model', content: 'Backend session expired', isError: true, errorCode: 'AUTH_FAILED' }
  ])

  assert.equal(state.inputBlocked, true)
  assert.equal(state.notice?.action, 'reconnect')
})

test('unblocks composer when backend is connected despite stale auth error', () => {
  const state = getComposerLimitState(
    [
      { role: 'user', content: 'hello' },
      { role: 'model', content: 'Backend session expired', isError: true, errorCode: 'AUTH_FAILED' }
    ],
    { backendConnected: true }
  )

  assert.equal(state.inputBlocked, false)
  assert.equal(state.notice, undefined)
})

test('blocks composer when monthly quota is exhausted', () => {
  const state = getComposerLimitState([
    { role: 'user', content: 'hello' },
    { role: 'model', content: 'Quota exceeded', isError: true, errorCode: 'QUOTA_EXCEEDED' }
  ])

  assert.equal(state.inputBlocked, true)
  assert.match(state.inputBlockedReason || '', /quota/i)
})

test('shows trim notice for long sessions without blocking input', () => {
  const messages = Array.from({ length: 15 }, (_, index) =>
    index % 2 === 0
      ? { role: 'user' as const, content: `message ${index}` }
      : { role: 'model' as const, content: `reply ${index}` }
  )

  const state = getComposerLimitState(messages)
  assert.equal(state.inputBlocked, false)
  assert.match(state.notice?.message || '', /15 messages/i)
})

test('guides model change when the selected model is unavailable', () => {
  const state = getComposerLimitState([
    { role: 'user', content: 'hello' },
    { role: 'model', content: 'Model unavailable', isError: true, errorCode: 'MODEL_UNAVAILABLE' }
  ])

  assert.equal(state.inputBlocked, false)
  assert.equal(state.notice?.action, 'model')
})

test('guides model change when provider rejects the request', () => {
  const state = getComposerLimitState([
    { role: 'user', content: 'hello' },
    { role: 'model', content: 'Bad request', isError: true, errorCode: 'INVALID_REQUEST' }
  ])

  assert.equal(state.inputBlocked, false)
  assert.equal(state.notice?.action, 'model')
})
