import { fileSystemService } from './services/fs'

export interface VSCodeEditorOption {
  id: string
  label: string
}

export interface VSCodeBridgeListResponse {
  items: VSCodeEditorOption[]
  defaultEditorId: string | null
}

export class VSCodeBridge {
  async listEditors(): Promise<VSCodeBridgeListResponse> {
    return fileSystemService.getAvailableEditors()
  }

  async open(targetPath: string, editorId?: string): Promise<void> {
    await fileSystemService.openEditorAtPath(targetPath, editorId)
  }
}

export const vscodeBridge = new VSCodeBridge()
