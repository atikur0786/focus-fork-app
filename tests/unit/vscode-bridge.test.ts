import test from 'node:test'
import assert from 'node:assert/strict'
import { vscodeBridge } from '../../src/main/vscode-bridge'
import { fileSystemService } from '../../src/main/services/fs'

test('vscode bridge lists editors via file system service', async () => {
  const original = fileSystemService.getAvailableEditors
  fileSystemService.getAvailableEditors = async () => ({
    items: [{ id: 'vscode-cli', label: 'VS Code' }],
    defaultEditorId: 'vscode-cli'
  })

  try {
    const result = await vscodeBridge.listEditors()
    assert.equal(result.defaultEditorId, 'vscode-cli')
    assert.deepEqual(result.items, [{ id: 'vscode-cli', label: 'VS Code' }])
  } finally {
    fileSystemService.getAvailableEditors = original
  }
})

test('vscode bridge opens editor via file system service', async () => {
  const original = fileSystemService.openEditorAtPath
  const calls: Array<{ path: string; editorId?: string }> = []
  fileSystemService.openEditorAtPath = async (path: string, editorId?: string) => {
    calls.push({ path, editorId })
  }

  try {
    await vscodeBridge.open('/tmp/repo', 'vscode-cli')
    assert.deepEqual(calls, [{ path: '/tmp/repo', editorId: 'vscode-cli' }])
  } finally {
    fileSystemService.openEditorAtPath = original
  }
})
