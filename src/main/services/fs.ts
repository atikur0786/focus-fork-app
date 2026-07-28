import { dialog, app } from 'electron'
import { existsSync, mkdirSync, renameSync } from 'fs'
import { join, resolve } from 'path'

const SAFE_COMMANDS: Record<string, Set<string>> = {
  npm: new Set(['install', 'ci', 'test', 'run', 'start']),
  pnpm: new Set(['install', 'test', 'run', 'start']),
  yarn: new Set(['install', 'test', 'run', 'start', 'dev']),
  bun: new Set(['install', 'test', 'run', 'start'])
}

type EditorCandidate = {
  id: string
  label: string
  bin: string
  args: string[]
}

export class FileSystemService {
  constructor() {}

  async selectDirectory(window: Electron.BrowserWindow): Promise<string | null> {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: 'Select Workspace Directory',
      properties: ['openDirectory', 'createDirectory']
    })

    if (canceled || filePaths.length === 0) {
      return null
    }

    return filePaths[0]
  }

  async selectFiles(
    window: Electron.BrowserWindow,
    options?: { title?: string; multi?: boolean; filters?: Electron.FileFilter[] }
  ): Promise<string[]> {
    const { canceled, filePaths } = await dialog.showOpenDialog(window, {
      title: options?.title || 'Select files',
      properties: options?.multi === false ? ['openFile'] : ['openFile', 'multiSelections'],
      filters: options?.filters
    })
    if (canceled || filePaths.length === 0) return []
    return filePaths
  }

  async ensureDirectoryExists(path: string): Promise<boolean> {
    try {
      if (!existsSync(path)) {
        mkdirSync(path, { recursive: true })
      }
      return true
    } catch (error) {
      console.error('Failed to create directory:', error)
      return false
    }
  }

  getDefaultWorkspace(): string {
    return join(app.getPath('documents'), 'FocusFork_Workspace')
  }

  async readDirectory(dirPath: string): Promise<{ name: string; isDirectory: boolean }[]> {
    const { readdir } = await import('fs/promises')
    try {
      const dirents = await readdir(dirPath, { withFileTypes: true })
      return dirents.map((dirent) => ({
        name: dirent.name,
        isDirectory: dirent.isDirectory()
      })).sort((a, b) => {
        if (a.isDirectory === b.isDirectory) {
          return a.name.localeCompare(b.name)
        }
        return a.isDirectory ? -1 : 1
      })
    } catch (error) {
      console.error('Failed to read directory:', error)
      return []
    }
  }

  async readFile(filePath: string): Promise<string> {
    const { readFile } = await import('fs/promises')
    try {
      return await readFile(filePath, 'utf-8')
    } catch (error) {
      console.error('Failed to read file:', error)
      throw error
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const { writeFile } = await import('fs/promises')
    try {
      await writeFile(filePath, content, 'utf-8')
    } catch (error) {
      console.error('Failed to write file:', error)
      throw error
    }
  }

  async readFileBuffer(filePath: string): Promise<Buffer> {
    const { readFile } = await import('fs/promises')
    try {
      return await readFile(filePath)
    } catch (error) {
      console.error('Failed to read file buffer:', error)
      throw error
    }
  }

  async createFile(filePath: string, content: string = ''): Promise<void> {
    const { writeFile } = await import('fs/promises')
    try {
      await writeFile(filePath, content, 'utf-8')
    } catch (error) {
      console.error('Failed to create file:', error)
      throw error
    }
  }

  async createDirectory(dirPath: string): Promise<void> {
    const { mkdir } = await import('fs/promises')
    try {
      await mkdir(dirPath, { recursive: true })
    } catch (error) {
      console.error('Failed to create directory:', error)
      throw error
    }
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    try {
      renameSync(oldPath, newPath)
    } catch (error) {
      console.error('Failed to rename path:', error)
      throw error
    }
  }

  async deletePath(targetPath: string): Promise<void> {
    const { rm } = await import('fs/promises')
    try {
      await rm(targetPath, { recursive: true, force: true })
    } catch (error) {
      console.error('Failed to delete path:', error)
      throw error
    }
  }

  async pathExists(targetPath: string): Promise<boolean> {
    const { access } = await import('fs/promises')
    try {
      await access(targetPath)
      return true
    } catch {
      return false
    }
  }

  async openTerminalAtPath(path: string): Promise<void> {
    const { spawn } = await import('child_process')
    try {
      if (process.platform === 'darwin') {
        spawn('open', ['-a', 'Terminal', path], { detached: true, stdio: 'ignore' }).unref()
      } else if (process.platform === 'win32') {
        spawn('cmd', ['/c', 'start', 'cmd.exe', '/K', `cd /d "${path}"`], { detached: true, stdio: 'ignore' }).unref()
      } else {
        const candidates: Array<{ bin: string; args: string[] }> = [
          { bin: 'x-terminal-emulator', args: ['--working-directory', path] },
          { bin: 'gnome-terminal', args: ['--working-directory', path] },
          { bin: 'konsole', args: ['--workdir', path] },
          { bin: 'xfce4-terminal', args: ['--working-directory', path] }
        ]
        let launched = false
        for (const candidate of candidates) {
          try {
            spawn(candidate.bin, candidate.args, { detached: true, stdio: 'ignore' }).unref()
            launched = true
            break
          } catch {
            // try next option
          }
        }
        if (!launched) {
          throw new Error('No supported Linux terminal emulator found')
        }
      }
    } catch (error) {
      console.error('Failed to open terminal:', error)
      throw error
    }
  }

  private getEditorCandidates(): EditorCandidate[] {
    if (process.platform === 'darwin') {
      return [
        { id: 'vscode-cli', label: 'VS Code', bin: 'code', args: ['--reuse-window'] },
        { id: 'cursor-cli', label: 'Cursor', bin: 'cursor', args: ['--reuse-window'] },
        { id: 'windsurf-cli', label: 'Windsurf', bin: 'windsurf', args: ['--reuse-window'] },
        { id: 'vscode-app', label: 'VS Code (App)', bin: 'open', args: ['-a', 'Visual Studio Code'] },
        { id: 'cursor-app', label: 'Cursor (App)', bin: 'open', args: ['-a', 'Cursor'] },
        { id: 'windsurf-app', label: 'Windsurf (App)', bin: 'open', args: ['-a', 'Windsurf'] }
      ]
    }
    if (process.platform === 'win32') {
      return [
        { id: 'vscode-cli', label: 'VS Code', bin: 'code', args: ['--reuse-window'] },
        { id: 'cursor-cli', label: 'Cursor', bin: 'cursor', args: ['--reuse-window'] },
        { id: 'windsurf-cli', label: 'Windsurf', bin: 'windsurf', args: ['--reuse-window'] }
      ]
    }
    return [
      { id: 'vscode-cli', label: 'VS Code', bin: 'code', args: ['--reuse-window'] },
      { id: 'vscodium-cli', label: 'VSCodium', bin: 'codium', args: ['--reuse-window'] },
      { id: 'cursor-cli', label: 'Cursor', bin: 'cursor', args: ['--reuse-window'] },
      { id: 'windsurf-cli', label: 'Windsurf', bin: 'windsurf', args: ['--reuse-window'] }
    ]
  }

  async getAvailableEditors(): Promise<{ items: Array<{ id: string; label: string }>; defaultEditorId: string | null }> {
    const { spawnSync } = await import('child_process')
    const candidates = this.getEditorCandidates()
    const detected: EditorCandidate[] = []
    for (const candidate of candidates) {
      try {
        const probeArgs = candidate.bin === 'open' ? ['-Ra', candidate.args[1]] : ['--version']
        const result = spawnSync(candidate.bin, probeArgs, { stdio: 'ignore' })
        if (!result.error && result.status === 0) {
          detected.push(candidate)
        }
      } catch {
        // not available
      }
    }
    return {
      items: detected.map((editor) => ({ id: editor.id, label: editor.label })),
      defaultEditorId: detected[0]?.id ?? null
    }
  }

  async openEditorAtPath(targetPath: string, preferredEditorId?: string): Promise<void> {
    const { spawn } = await import('child_process')

    const tryLaunch = async (candidate: EditorCandidate, normalizedPath: string) =>
      new Promise<boolean>((resolveLaunch) => {
        const child = spawn(candidate.bin, [...candidate.args, normalizedPath], { detached: true, stdio: 'ignore' })
        let settled = false

        child.once('error', () => {
          if (settled) return
          settled = true
          resolveLaunch(false)
        })

        child.once('spawn', () => {
          child.unref()
          setTimeout(() => {
            if (settled) return
            settled = true
            resolveLaunch(true)
          }, 100)
        })

        child.once('close', (code) => {
          if (settled) return
          settled = true
          resolveLaunch(code === 0)
        })
      })

    const normalizedPath = resolve(targetPath)
    const detected = await this.getAvailableEditors()
    const candidateMap = new Map(this.getEditorCandidates().map((candidate) => [candidate.id, candidate]))
    const detectedCandidates = detected.items
      .map((item) => candidateMap.get(item.id))
      .filter((item): item is EditorCandidate => !!item)

    const orderedCandidates =
      preferredEditorId && candidateMap.has(preferredEditorId)
        ? [
            candidateMap.get(preferredEditorId)!,
            ...detectedCandidates.filter((candidate) => candidate.id !== preferredEditorId)
          ]
        : detectedCandidates

    for (const candidate of orderedCandidates) {
      const launched = await tryLaunch(candidate, normalizedPath)
      if (launched) return
    }

    throw new Error('No supported code editor found. Install VS Code/Cursor/Windsurf and add CLI to PATH.')
  }

  async runCommandInDirectory(
    cwd: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const { spawn } = await import('child_process')
    const normalizedCwd = resolve(cwd)
    if (!existsSync(normalizedCwd)) {
      throw new Error('Working directory does not exist')
    }

    const trimmed = command.trim()
    if (!trimmed) {
      throw new Error('Command is required')
    }
    if (/[;&|`$><]/.test(trimmed)) {
      throw new Error('Unsafe command syntax is not allowed')
    }

    const parts = trimmed.split(/\s+/)
    const bin = parts[0]
    const args = parts.slice(1)

    const allowedArgs = SAFE_COMMANDS[bin]
    if (!allowedArgs) {
      throw new Error('Command is not allowed')
    }
    if (args.length === 0) {
      throw new Error('Command requires arguments')
    }
    if (!allowedArgs.has(args[0])) {
      throw new Error('Command argument is not allowed')
    }

    if (args[0] === 'run' && args.length < 2) {
      throw new Error('run command requires a script name')
    }
    if (args[0] !== 'run' && args.slice(1).some((arg) => !arg.startsWith('-'))) {
      throw new Error('Only command flags are allowed after the first argument')
    }

    return new Promise((resolve, reject) => {
      try {
        const child = spawn(bin, args, {
          cwd: normalizedCwd,
          shell: false,
          env: process.env
        })

        let stdout = ''
        let stderr = ''

        child.stdout?.on('data', (data: Buffer) => {
          stdout += data.toString()
        })
        child.stderr?.on('data', (data: Buffer) => {
          stderr += data.toString()
        })

        child.on('error', (error) => reject(error))
        child.on('close', (exitCode) => resolve({ stdout, stderr, exitCode }))
      } catch (error) {
        reject(error)
      }
    })
  }

  async searchInDirectory(dirPath: string, query: string, options?: { maxResults?: number }): Promise<Array<{ path: string; line: number; column: number; preview: string }>> {
    const { readdir, readFile, stat } = await import('fs/promises')
    const results: Array<{ path: string; line: number; column: number; preview: string }> = []
    const seen = new Set<string>()
    const maxResults = options?.maxResults ?? 200
    const ignoreDirs = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.next', '.turbo'])
    const maxFileSizeBytes = 1024 * 1024

    const isTextFile = (content: string) => !content.includes('\u0000')
    const normalizedQuery = query.trim().toLowerCase()

    const walk = async (currentPath: string) => {
      if (results.length >= maxResults) return
      let entries: { name: string; isDirectory: () => boolean; isSymbolicLink: () => boolean }[]
      try {
        entries = (await readdir(currentPath, { withFileTypes: true })) as {
          name: string
          isDirectory: () => boolean
          isSymbolicLink: () => boolean
        }[]
      } catch {
        return
      }
      for (const entry of entries) {
        if (results.length >= maxResults) break
        if (entry.isSymbolicLink()) continue
        if (entry.isDirectory()) {
          if (ignoreDirs.has(entry.name)) continue
          await walk(join(currentPath, entry.name))
          continue
        }
        const filePath = join(currentPath, entry.name)
        const relativePath = filePath.replace(`${dirPath}/`, '')
        const pathMatchIndex = relativePath.toLowerCase().indexOf(normalizedQuery)
        if (pathMatchIndex !== -1) {
          const key = `${filePath}:1:${pathMatchIndex + 1}`
          if (!seen.has(key)) {
            seen.add(key)
            results.push({
              path: filePath,
              line: 1,
              column: pathMatchIndex + 1,
              preview: `[file] ${relativePath}`
            })
          }
          if (results.length >= maxResults) break
        }
        let fileStat: Awaited<ReturnType<typeof stat>>
        try {
          fileStat = await stat(filePath)
        } catch {
          continue
        }
        if (fileStat.size > maxFileSizeBytes) continue
        let content = ''
        try {
          content = await readFile(filePath, 'utf-8')
        } catch {
          continue
        }
        if (!isTextFile(content)) continue

        const lines = content.split('\n')
        for (let i = 0; i < lines.length; i++) {
          const col = lines[i].toLowerCase().indexOf(normalizedQuery)
          if (col !== -1) {
            const key = `${filePath}:${i + 1}:${col + 1}`
            if (!seen.has(key)) {
              seen.add(key)
              results.push({
                path: filePath,
                line: i + 1,
                column: col + 1,
                preview: lines[i].slice(0, 300)
              })
            }
            if (results.length >= maxResults) break
          }
        }
      }
    }

    if (!normalizedQuery) return results
    await walk(dirPath)
    return results
  }
}

export const fileSystemService = new FileSystemService()
