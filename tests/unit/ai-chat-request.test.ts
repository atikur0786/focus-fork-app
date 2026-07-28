import test from 'node:test'
import assert from 'node:assert/strict'
import { normalizeChatRoles, prepareAiChatPayload } from '../../src/renderer/src/lib/ai-chat-request'

test('merges consecutive user messages before sending to the AI provider', () => {
  const normalized = normalizeChatRoles([
    { role: 'user', content: 'first prompt' },
    { role: 'user', content: 'second prompt' },
    { role: 'model', content: 'reply' },
    { role: 'user', content: 'follow up' }
  ])

  assert.equal(normalized.length, 3)
  assert.equal(normalized[0]?.role, 'user')
  assert.match(normalized[0]?.content || '', /first prompt/)
  assert.match(normalized[0]?.content || '', /second prompt/)
})

test('prepareAiChatPayload normalizes roles in the outgoing payload', () => {
  const prepared = prepareAiChatPayload(
    [
      { role: 'user', content: 'hello' },
      { role: 'user', content: 'again' }
    ],
    'context'
  )

  assert.equal(prepared.messages.length, 1)
  assert.equal(prepared.messages[0]?.role, 'user')
  assert.match(prepared.messages[0]?.content || '', /again/)
})
