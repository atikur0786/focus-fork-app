import * as vscode from 'vscode'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const execFileAsync = promisify(execFile)

export async function getWorkspacePath(): Promise<string> {
  const folder = vscode.workspace.workspaceFolders?.[0]
  if (!folder) {
    throw new Error('Open the cloned repository in Code OSS first.')
  }
  return folder.uri.fsPath
}

export async function detectTestCommand(cwd: string): Promise<{ bin: string; args: string[] }> {
  if (existsSync(join(cwd, 'pnpm-lock.yaml'))) return { bin: 'pnpm', args: ['test'] }
  if (existsSync(join(cwd, 'yarn.lock'))) return { bin: 'yarn', args: ['test'] }
  if (existsSync(join(cwd, 'package.json'))) return { bin: 'npm', args: ['test'] }
  return { bin: 'git', args: ['status'] }
}

export async function runCommand(cwd: string, bin: string, args: string[]): Promise<string> {
  const { stdout, stderr } = await execFileAsync(bin, args, { cwd })
  return `${stdout || ''}${stderr || ''}`.trim()
}

export async function currentBranch(cwd: string): Promise<string> {
  const output = await runCommand(cwd, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
  return output.split('\n').pop()?.trim() || 'main'
}

export async function commitAndPush(cwd: string, message: string): Promise<{ branch: string }> {
  await runCommand(cwd, 'git', ['add', '-A'])
  await runCommand(cwd, 'git', ['commit', '-m', message])
  const branch = await currentBranch(cwd)
  await runCommand(cwd, 'git', ['push', '-u', 'origin', branch])
  return { branch }
}
