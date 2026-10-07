import { app } from 'electron'
import fs from 'fs'
import path from 'path'

class RendererStorageService {
  private filePath = ''
  private data: Record<string, string> = {}

  initialize(): void {
    this.filePath = path.join(app.getPath('userData'), 'renderer-state.json')
    try {
      if (!fs.existsSync(this.filePath)) {
        this.data = {}
        return
      }
      const parsed = JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as unknown
      this.data = typeof parsed === 'object' && parsed !== null ? parsed as Record<string, string> : {}
    } catch {
      this.data = {}
    }
  }

  getItem(key: string): string | null {
    return this.data[key] ?? null
  }

  setItem(key: string, value: string): void {
    this.data[key] = value
    this.flush()
  }

  removeItem(key: string): void {
    delete this.data[key]
    this.flush()
  }

  private flush(): void {
    if (!this.filePath) return
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true })
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2))
  }
}

export const rendererStorageService = new RendererStorageService()
