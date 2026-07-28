export {}

declare global {
  interface Window {
    vscodeAPI: {
      listEditors: () => Promise<{ items: Array<{ id: string; label: string }>; defaultEditorId: string | null }>
      open: (path: string, editorId?: string) => Promise<void>
    }
    gitAPI: {
      clone: (url: string, parentDir: string, dirName: string) => Promise<string>
      commitAndPush: (dir: string, message: string, files?: string[], branch?: string) => Promise<void>
      status: (dir: string) => Promise<any>
      add: (dir: string, files: string[]) => Promise<void>
      commit: (dir: string, message: string) => Promise<void>
      push: (dir: string) => Promise<void>
      currentBranch: (dir: string) => Promise<string>
      checkout: (dir: string, branch: string, create?: boolean) => Promise<void>
      pushWithUpstream: (dir: string, branch: string) => Promise<void>
      readFileAtHead: (dir: string, path: string) => Promise<string>
      discardFile: (dir: string, path: string) => Promise<void>
      discardAll: (dir: string) => Promise<void>
      listTrackedFiles: (dir: string) => Promise<string[]>
    }
    fsAPI: {
      listFiles: (path: string) => Promise<string[]>
      readFile: (path: string) => Promise<string>
    }
  }
}
