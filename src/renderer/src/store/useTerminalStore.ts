import { create } from 'zustand'

const MAX_OUTPUT_LINES = 200

interface TerminalState {
  ptyId: string | null
  setPtyId: (id: string | null) => void
  outputLines: string[]
  appendOutput: (data: string) => void
  clearOutput: () => void
  getRecentOutput: (maxLines?: number) => string
}

export const useTerminalStore = create<TerminalState>((set, get) => ({
  ptyId: null,
  setPtyId: (id) => set({ ptyId: id }),
  outputLines: [],
  appendOutput: (data: string) => {
    set((state) => {
      const newLines = data.split('\n')
      const combined = [...state.outputLines, ...newLines]
      return {
        outputLines: combined.length > MAX_OUTPUT_LINES
          ? combined.slice(-MAX_OUTPUT_LINES)
          : combined
      }
    })
  },
  clearOutput: () => set({ outputLines: [] }),
  getRecentOutput: (maxLines = 50) => {
    const { outputLines } = get()
    const recent = outputLines.slice(-maxLines)
    return recent
      .map((line) => line.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\r/g, ''))
      .filter((line) => line.trim().length > 0)
      .join('\n')
  }
}))
