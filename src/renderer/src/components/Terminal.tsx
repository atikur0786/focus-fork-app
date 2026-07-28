import { useEffect, useRef, useState } from 'react'
import { Terminal as XTerm } from 'xterm'
import { FitAddon } from 'xterm-addon-fit'
import 'xterm/css/xterm.css'
import { useSettingsStore } from '../store/useSettingsStore'
import { useTerminalStore } from '../store/useTerminalStore'
import { useUIStore } from '../store/useUIStore'

const TERMINAL_THEMES = {
  light: {
    background: '#f4f4f0',
    foreground: '#2b2a26',
    cursor: '#2b2a26',
    selectionBackground: '#2b2a2640'
  },
  dark: {
    background: '#141414',
    foreground: '#ececec',
    cursor: '#f5f4f0',
    selectionBackground: '#f5f4f040'
  }
} as const

type TerminalThemeName = keyof typeof TERMINAL_THEMES
type TerminalMode = 'pty' | 'fallback'
type TerminalSessionInfo = { id?: string; mode?: TerminalMode; shell?: string; cwd?: string }

const MIN_TERMINAL_WIDTH = 40
const MIN_TERMINAL_HEIGHT = 80

function resolveTerminalTheme(theme: 'light' | 'dark' | 'system'): TerminalThemeName {
  if (theme === 'light' || theme === 'dark') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function waitForTerminalSize(container: HTMLElement): Promise<void> {
  if (container.clientWidth >= MIN_TERMINAL_WIDTH && container.clientHeight >= MIN_TERMINAL_HEIGHT) {
    return Promise.resolve()
  }

  return new Promise((resolve) => {
    const observer = new ResizeObserver(() => {
      if (container.clientWidth >= MIN_TERMINAL_WIDTH && container.clientHeight >= MIN_TERMINAL_HEIGHT) {
        observer.disconnect()
        resolve()
      }
    })
    observer.observe(container)

    window.setTimeout(() => {
      observer.disconnect()
      resolve()
    }, 1500)
  })
}

export function Terminal({ visible = true }: { visible?: boolean }): React.JSX.Element {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<XTerm | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const syncSizeRef = useRef<() => void>(() => {})
  const ptyIdRef = useRef<string>(Math.random().toString(36).substring(7))
  const { activeRepoPath } = useSettingsStore()
  const { theme } = useUIStore()
  const terminalTheme = resolveTerminalTheme(theme)
  const { setPtyId, appendOutput } = useTerminalStore()
  const [status, setStatus] = useState<'connecting' | 'ready' | 'error'>('connecting')
  const [mode, setMode] = useState<TerminalMode>('pty')
  const [debugInfo, setDebugInfo] = useState<string>('')

  useEffect(() => {
    const term = xtermRef.current
    if (!term) return
    term.options.theme = TERMINAL_THEMES[terminalTheme]
  }, [terminalTheme])

  useEffect(() => {
    const container = terminalRef.current
    if (!container) return

    let disposed = false
    const ptyId = ptyIdRef.current

    const term = new XTerm({
      cursorBlink: true,
      theme: TERMINAL_THEMES[terminalTheme],
      fontFamily: 'Menlo, Monaco, "Courier New", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      disableStdin: false,
      convertEol: true,
      scrollback: 5000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(container)

    xtermRef.current = term
    fitAddonRef.current = fitAddon

    const writeToPty = (data: string) => {
      void window.api.terminal.write({ id: ptyId, data }).catch((error: unknown) => {
        if (disposed) return
        console.error('[Terminal] pty write failed:', error)
      })
    }

    const applySession = (info?: TerminalSessionInfo) => {
      if (disposed) return
      const nextMode: TerminalMode = info?.mode === 'fallback' ? 'fallback' : 'pty'
      setMode(nextMode)
      setStatus('ready')
      if (info) {
        setDebugInfo(JSON.stringify(info))
      }
    }

    const syncSize = () => {
      if (disposed) return
      try {
        fitAddon.fit()
      } catch {
        return
      }
      void window.api.terminal.resize({
        id: ptyId,
        cols: Math.max(term.cols, 2),
        rows: Math.max(term.rows, 2)
      })
    }
    syncSizeRef.current = syncSize

    const focusTerminal = () => {
      if (disposed) return
      term.focus()
    }

    const dataHandler = (data: string) => {
      term.write(data)
      appendOutput(data)
    }

    const readyHandler = (info: TerminalSessionInfo) => {
      applySession(info)
      requestAnimationFrame(() => {
        syncSize()
        focusTerminal()
      })
    }

    const errorHandler = (data: { message?: string }) => {
      if (disposed) return
      setStatus('error')
      setDebugInfo(JSON.stringify(data))
      term.writeln(`\r\n[pty error] ${data?.message || 'PTY spawn failed'}`)
    }

    const exitHandler = (data: unknown) => {
      if (disposed) return
      setStatus('error')
      setDebugInfo(JSON.stringify(data))
      term.writeln(`\r\n[pty exited] ${JSON.stringify(data)}`)
    }

    const unsubscribeData = window.api.terminal.onData(ptyId, dataHandler)
    const unsubscribeReady = window.api.terminal.onReady(ptyId, readyHandler)
    const unsubscribeError = window.api.terminal.onError(ptyId, errorHandler)
    const unsubscribeExit = window.api.terminal.onExit(ptyId, exitHandler)

    term.onData((data) => {
      writeToPty(data)
    })

    term.attachCustomKeyEventHandler((event) => {
      const isMac = navigator.platform.toLowerCase().includes('mac')
      const mod = isMac ? event.metaKey : event.ctrlKey
      if (mod && event.key.toLowerCase() === 'c' && term.hasSelection()) {
        void navigator.clipboard.writeText(term.getSelection())
        return false
      }
      if (mod && event.key.toLowerCase() === 'v') {
        void navigator.clipboard.readText().then((text) => {
          if (text) writeToPty(text)
        })
        return false
      }
      return true
    })

    const focusHandler = () => focusTerminal()
    window.addEventListener('terminal:focus', focusHandler as EventListener)

    const resizeObserver = new ResizeObserver(() => {
      syncSize()
    })
    resizeObserver.observe(container)

    const onWindowResize = () => syncSize()
    window.addEventListener('resize', onWindowResize)

    void (async () => {
      await waitForTerminalSize(container)
      if (disposed) return

      syncSize()
      focusTerminal()

      try {
        const session = (await window.api.terminal.create({
          id: ptyId,
          cols: Math.max(term.cols, 2),
          rows: Math.max(term.rows, 2),
          cwd: activeRepoPath ?? undefined
        })) as TerminalSessionInfo
        if (disposed) return
        setPtyId(ptyId)
        applySession(session)
        requestAnimationFrame(() => {
          syncSize()
          focusTerminal()
        })
      } catch (error) {
        if (disposed) return
        setStatus('error')
        setDebugInfo(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => {
      disposed = true
      unsubscribeData()
      unsubscribeReady()
      unsubscribeError()
      unsubscribeExit()
      window.removeEventListener('terminal:focus', focusHandler as EventListener)
      window.removeEventListener('resize', onWindowResize)
      resizeObserver.disconnect()
      void window.api.terminal.destroy({ id: ptyId })
      term.dispose()
      xtermRef.current = null
      fitAddonRef.current = null
      setPtyId(null)
    }
  }, [activeRepoPath, setPtyId])

  useEffect(() => {
    if (!visible) return
    const frame = requestAnimationFrame(() => {
      syncSizeRef.current()
      xtermRef.current?.focus()
    })
    return () => cancelAnimationFrame(frame)
  }, [visible])

  return (
    <div
      className="workspace-terminal-root relative h-full w-full min-h-0"
      style={{ backgroundColor: TERMINAL_THEMES[terminalTheme].background }}
      data-testid="workspace-terminal-root"
      aria-hidden={!visible}
    >
      <div
        ref={terminalRef}
        className="h-full w-full min-h-0"
        data-testid="workspace-terminal-surface"
        onMouseDown={(event) => {
          event.stopPropagation()
          xtermRef.current?.focus()
        }}
      />
      {mode === 'fallback' && status === 'ready' && (
        <div className="pointer-events-none absolute top-2 right-2">
          <span className="rounded border border-amber-500/30 bg-amber-500/20 px-2 py-1 text-[10px] text-amber-200">
            Limited terminal mode
          </span>
        </div>
      )}
      {status === 'connecting' && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center">
          <span className="rounded bg-black/40 px-2 py-1 text-[11px] text-zinc-200">Starting terminal…</span>
        </div>
      )}
      {status === 'error' && (
        <div className="pointer-events-none absolute inset-x-0 top-2 flex justify-center px-3">
          <span className="rounded border border-red-400/40 bg-red-950/80 px-2 py-1 text-[11px] text-red-100">
            Terminal error{debugInfo ? `: ${debugInfo}` : ''}. Close and reopen the terminal panel.
          </span>
        </div>
      )}
    </div>
  )
}
