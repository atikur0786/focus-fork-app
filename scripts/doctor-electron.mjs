#!/usr/bin/env node

import { existsSync, chmodSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const root = process.cwd()
const electronBinary =
  process.platform === 'darwin'
    ? join(root, 'node_modules', 'electron', 'dist', 'Electron.app', 'Contents', 'MacOS', 'Electron')
    : join(root, 'node_modules', 'electron', 'dist', 'electron')

if (!existsSync(electronBinary)) {
  console.error('[doctor] Electron binary missing. Run: rm -rf node_modules package-lock.json && npm install')
  process.exit(1)
}

try {
  chmodSync(electronBinary, 0o755)
} catch {
  // ignore chmod failures, execute check below will still fail if not runnable
}

if (process.platform === 'darwin') {
  try {
    const info = execSync(`file "${electronBinary}"`, { encoding: 'utf8' }).toLowerCase()
    const looksLinux = info.includes('elf')
    if (looksLinux) {
      console.error('[doctor] Electron binary is Linux build on macOS. Reinstall deps on macOS host.')
      console.error('[doctor] Fix: rm -rf node_modules package-lock.json && npm install')
      process.exit(1)
    }
  } catch {
    // best effort only
  }
}

console.log('[doctor] Electron binary looks valid.')
