import * as pty from 'node-pty'
import { BrowserWindow } from 'electron'
import os from 'os'
import { existsSync, accessSync, constants } from 'fs'
import { spawn, ChildProcessWithoutNullStreams } from 'child_process'

type PtyProcess =
  | { type: 'pty'; proc: pty.IPty }
  | { type: 'child'; proc: ChildProcessWithoutNullStreams }

export class PtyService {
  private ptyProcesses = new Map<string, PtyProcess>()
  private sessionMeta = new Map<string, { shell: string; cwd?: string; mode: 'pty' | 'fallback' }>()

  getSession(id: string) {
    const meta = this.sessionMeta.get(id)
    if (!meta) return null
    return { id, ...meta }
  }

  private shellArgs(shell: string): string[] {
    if (os.platform() === 'win32') return []
    const base = shell.split('/').pop() || shell
    if (base === 'zsh' || base === 'bash') return ['-il']
    return ['-i']
  }

  private broadcast(channel: string, payload: unknown) {
    BrowserWindow.getAllWindows().forEach((win) => {
      if (!win.isDestroyed()) {
        win.webContents.send(channel, payload)
      }
    })
  }

  create(id: string, options: { cols: number; rows: number; cwd?: string }) {
    const cols = Math.max(options.cols || 80, 2)
    const rows = Math.max(options.rows || 24, 2)
    const shells =
      os.platform() === 'win32'
        ? ['powershell.exe']
        : [process.env.SHELL || '', '/bin/zsh', '/bin/bash', '/bin/sh'].filter(Boolean)

    const cwd = options.cwd && existsSync(options.cwd) ? options.cwd : process.env.HOME
    const candidates = shells.filter((shell) => {
      try {
        accessSync(shell, constants.X_OK)
        return true
      } catch {
        return false
      }
    })

    if (candidates.length === 0) {
      const message = 'No executable shell found for embedded terminal'
      this.broadcast(`pty:error:${id}`, { message })
      throw new Error(message)
    }

    let lastError: Error | null = null

    for (const shell of candidates) {
      try {
        const args = this.shellArgs(shell)
        const ptyProcess = pty.spawn(shell, args, {
          name: 'xterm-256color',
          cols,
          rows,
          cwd,
          env: {
            ...process.env,
            PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor'
          } as NodeJS.ProcessEnv
        })

        ptyProcess.onData((data) => {
          this.broadcast(`pty:data:${id}`, data)
        })

        ptyProcess.onExit(({ exitCode, signal }) => {
          this.broadcast(`pty:exit:${id}`, { exitCode, signal })
          this.ptyProcesses.delete(id)
          this.sessionMeta.delete(id)
        })

        this.ptyProcesses.set(id, { type: 'pty', proc: ptyProcess })
        this.sessionMeta.set(id, { shell, cwd, mode: 'pty' })
        this.broadcast(`pty:ready:${id}`, { shell, cwd, mode: 'pty' })
        return
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
      }
    }

    // Last resort: piped child process (limited interactivity).
    try {
      const fallbackShell = candidates[0]
      const child = spawn(fallbackShell, this.shellArgs(fallbackShell), {
        cwd,
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/bin:/bin:/usr/sbin:/sbin',
          TERM: 'xterm-256color'
        },
        stdio: 'pipe'
      })

      child.stdout.on('data', (data) => {
        this.broadcast(`pty:data:${id}`, data.toString())
      })
      child.stderr.on('data', (data) => {
        this.broadcast(`pty:data:${id}`, data.toString())
      })
      child.on('exit', (code, signal) => {
        this.broadcast(`pty:exit:${id}`, { exitCode: code, signal })
        this.ptyProcesses.delete(id)
        this.sessionMeta.delete(id)
      })

      this.ptyProcesses.set(id, { type: 'child', proc: child })
      this.sessionMeta.set(id, { shell: fallbackShell, cwd, mode: 'fallback' })
      this.broadcast(`pty:ready:${id}`, { shell: fallbackShell, cwd, mode: 'fallback' })
    } catch (error) {
      const message = lastError?.message || (error instanceof Error ? error.message : 'PTY spawn failed')
      this.broadcast(`pty:error:${id}`, { message })
      throw new Error(message)
    }
  }

  write(id: string, data: string) {
    const ptyProcess = this.ptyProcesses.get(id)
    if (!ptyProcess) {
      console.warn(`[pty] write ignored — no session for id=${id}`)
      return
    }
    if (ptyProcess.type === 'pty') {
      ptyProcess.proc.write(data)
      return
    }
    if (ptyProcess.proc.stdin.writable) {
      ptyProcess.proc.stdin.write(data)
    }
  }

  resize(id: string, cols: number, rows: number) {
    const ptyProcess = this.ptyProcesses.get(id)
    if (ptyProcess?.type === 'pty') {
      ptyProcess.proc.resize(Math.max(cols, 2), Math.max(rows, 2))
    }
  }

  destroy(id: string) {
    const ptyProcess = this.ptyProcesses.get(id)
    if (ptyProcess?.type === 'pty') {
      ptyProcess.proc.kill()
    } else if (ptyProcess?.type === 'child') {
      ptyProcess.proc.kill()
    }
    this.ptyProcesses.delete(id)
    this.sessionMeta.delete(id)
  }
}

export const ptyService = new PtyService()
