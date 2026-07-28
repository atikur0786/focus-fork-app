import test from 'node:test'
import assert from 'node:assert/strict'
import {
  filterSelectableModels,
  isZeroOperatorCostModel,
  pickDefaultModel
} from '../../src/renderer/src/lib/model-entitlements'
import type { PlatformModelOption } from '../../src/renderer/src/lib/platform-models'

const catalog: PlatformModelOption[] = [
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    label: 'Llama 3.3 70B (Free)',
    available: true,
    inputCostPerM: 0,
    outputCostPerM: 0
  },
  {
    id: 'deepseek/deepseek-r1:free',
    label: 'DeepSeek R1 (Free)',
    available: true,
    inputCostPerM: 0,
    outputCostPerM: 0
  },
  {
    id: 'openai/gpt-4o-mini',
    label: 'GPT-4o Mini',
    available: true,
    inputCostPerM: 0.15,
    outputCostPerM: 0.6
  },
  {
    id: 'openai/gpt-4o',
    label: 'GPT-4o',
    available: false,
    inputCostPerM: 5,
    outputCostPerM: 15
  }
]

test('free plan only allows zero operator cost models', () => {
  const selectable = filterSelectableModels(catalog, 'free')
  assert.equal(selectable.length, 2)
  assert.equal(selectable[0]?.id, 'meta-llama/llama-3.3-70b-instruct:free')
})

test('pro plan allows entitled paid models', () => {
  const selectable = filterSelectableModels(catalog, 'pro')
  assert.equal(selectable.length, 3)
})

test('pickDefaultModel falls back off disallowed current model', () => {
  assert.equal(
    pickDefaultModel(catalog, 'free', 'openai/gpt-4o-mini'),
    'meta-llama/llama-3.3-70b-instruct:free'
  )
})

test('isZeroOperatorCostModel detects OpenRouter free routes', () => {
  assert.equal(isZeroOperatorCostModel(catalog[0]!), true)
  assert.equal(isZeroOperatorCostModel(catalog[2]!), false)
})
