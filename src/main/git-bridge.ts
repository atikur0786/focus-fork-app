import { fileSystemService } from './services/fs'
import { gitService } from './services/git'
import type { GitAuthorIdentity } from './lib/git-author'

export interface CommitAndPushPayload {
  dir: string
  message: string
  files?: string[]
  branch?: string
  author: GitAuthorIdentity
}

const IGNORED_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  '.nuxt',
  '.turbo',
  '.cache',
  '.vercel',
  '.output',
  '.agent',
  'dist',
  'build',
  'out',
  'coverage',
  '.pnpm-store',
  '__pycache__',
  '.venv',
  'venv'
])

const walkFiles = async (rootPath: string): Promise<string[]> => {
  const entries = await fileSystemService.readDirectory(rootPath)
  const results = await Promise.all(
    entries.map(async (entry) => {
      if (entry.isDirectory && IGNORED_DIR_NAMES.has(entry.name)) {
        return []
      }
      const fullPath = `${rootPath}/${entry.name}`
      if (entry.isDirectory) {
        return walkFiles(fullPath)
      }
      return [fullPath]
    })
  )
  return results.flat()
}

export class GitBridge {
  async clone(url: string, parentDir: string, dirName: string): Promise<string> {
    return gitService.clone(url, parentDir, dirName)
  }

  async commitAndPush(payload: CommitAndPushPayload): Promise<void> {
    const files = Array.isArray(payload.files) ? payload.files.filter(Boolean) : []
    if (files.length > 0) {
      await gitService.add(payload.dir, files)
    }
    await gitService.commit(payload.dir, payload.message, payload.author)
    if (payload.branch) {
      try {
        await gitService.push(payload.dir)
      } catch {
        await gitService.pushWithUpstream(payload.dir, payload.branch)
      }
      return
    }
    await gitService.push(payload.dir)
  }

  async listFiles(dir: string): Promise<string[]> {
    return walkFiles(dir)
  }

  async listTrackedFiles(dir: string): Promise<string[]> {
    try {
      return await gitService.listTrackedFiles(dir)
    } catch {
      return walkFiles(dir)
    }
  }

  async readFile(path: string): Promise<string> {
    return fileSystemService.readFile(path)
  }
}

export const gitBridge = new GitBridge()
