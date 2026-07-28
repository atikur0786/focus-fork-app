import axios from 'axios'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

export interface ReleaseManifest {
  version: string
  notes: string
  download_url?: string
  published_at?: string
}

const GITHUB_RELEASES_URL = 'https://api.github.com/repos/atikur0786/focus-fork-app/releases/latest'

function parseVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((part) => Number.parseInt(part.replace(/[^0-9].*$/, ''), 10))
    .map((part) => (Number.isFinite(part) ? part : 0))
}

export function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  const length = Math.max(a.length, b.length)
  for (let index = 0; index < length; index += 1) {
    const left = a[index] ?? 0
    const right = b[index] ?? 0
    if (left > right) return true
    if (left < right) return false
  }
  return false
}

function readBundledManifest(): ReleaseManifest | null {
  const candidates = [
    path.join(process.cwd(), 'resources', 'release-manifest.json'),
    path.join(app.getAppPath(), 'resources', 'release-manifest.json')
  ]
  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf-8')) as ReleaseManifest
      if (parsed?.version && parsed?.notes) return parsed
    } catch {
      // Try next candidate.
    }
  }
  return null
}

async function fetchManifest(url: string): Promise<ReleaseManifest | null> {
  const response = await axios.get(url, {
    timeout: 12000,
    headers: {
      Accept: 'application/json'
    }
  })
  const data = response.data as ReleaseManifest
  if (!data?.version || !data?.notes) return null
  return data
}

async function fetchGitHubRelease(): Promise<ReleaseManifest | null> {
  const response = await axios.get(GITHUB_RELEASES_URL, {
    timeout: 12000,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'FocusFork-Desktop'
    }
  })
  const tag = String(response.data?.tag_name || response.data?.name || '').trim()
  const notes = String(response.data?.body || 'A new FocusFork release is available.').trim()
  const downloadUrl = String(response.data?.html_url || '').trim()
  if (!tag) return null
  return {
    version: tag,
    notes,
    download_url: downloadUrl || undefined,
    published_at: String(response.data?.published_at || '')
  }
}

export async function checkForDesktopUpdate(backendBaseURL?: string): Promise<{
  currentVersion: string
  updateAvailable: boolean
  manifest: ReleaseManifest | null
}> {
  const currentVersion = app.getVersion()
  const sources = [
    process.env.FOCUSFORK_UPDATE_MANIFEST_URL,
    backendBaseURL ? `${backendBaseURL.replace(/\/$/, '')}/v1/app/release` : undefined
  ].filter(Boolean) as string[]

  let manifest: ReleaseManifest | null = null
  for (const source of sources) {
    try {
      manifest = await fetchManifest(source)
      if (manifest) break
    } catch {
      // Try the next source.
    }
  }

  if (!manifest) {
    try {
      manifest = await fetchGitHubRelease()
    } catch {
      manifest = readBundledManifest()
    }
  }

  const updateAvailable = manifest ? isNewerVersion(manifest.version, currentVersion) : false
  return {
    currentVersion,
    updateAvailable,
    manifest: updateAvailable ? manifest : null
  }
}
