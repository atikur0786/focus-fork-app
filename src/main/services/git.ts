import simpleGit, { type SimpleGit } from 'simple-git'
import { existsSync } from 'fs'
import { join, relative } from 'path'
import { gitAuthorEnv, type GitAuthorIdentity } from '../lib/git-author'
import { parseGitHubPushTarget } from '../lib/github-push-target'

export class GitService {
  /** GitHub token used to authenticate HTTPS push/fetch. Never logged. */
  private githubToken: string | null = null

  private pushVerifier: ((owner: string, repo: string) => Promise<void>) | null = null

  constructor(private readonly createGit: typeof simpleGit = simpleGit) {}

  setPushVerifier(verifier: (owner: string, repo: string) => Promise<void>): void {
    this.pushVerifier = verifier
  }

  private async pushRemote(git: SimpleGit, branch: string): Promise<string> {
    for (const key of [`branch.${branch}.pushRemote`, 'remote.pushDefault', `branch.${branch}.remote`]) {
      const value = (await git.getConfig(key)).value?.trim()
      if (value) return value
    }
    return 'origin'
  }

  private async verifyPushRemote(git: SimpleGit, remote: string): Promise<void> {
    if (!this.pushVerifier) {
      throw new Error('Push blocked: sign in to GitHub so FocusFork can verify your personal fork.')
    }
    let urls: string[]
    try {
      const output = await git.remote(['get-url', '--push', '--all', remote])
      urls = (output || '').trim().split(/\r?\n/).filter(Boolean)
    } catch {
      throw new Error('Push blocked: the configured push remote could not be resolved. Set origin to your personal fork.')
    }
    if (urls.length !== 1) {
      throw new Error('Push blocked: configure exactly one push URL pointing to your personal fork.')
    }
    const { owner, repo } = parseGitHubPushTarget(urls[0])
    await this.pushVerifier(owner, repo)
  }

  private async verifiedPushTarget(git: SimpleGit, explicitBranch?: string) {
    const branch = explicitBranch || (await git.branchLocal()).current
    if (!branch || branch === 'HEAD') {
      throw new Error('Push blocked: switch to a local branch before pushing.')
    }
    await git.raw(['check-ref-format', '--branch', branch])
    const remote = await this.pushRemote(git, branch)
    // Also check the tracking target during fallback, so an upstream block
    // cannot be bypassed by the caller retrying with --set-upstream.
    await this.verifyPushRemote(git, remote)
    return { branch, remote }
  }

  setGitHubToken(token: string | null): void {
    this.githubToken = token
  }

  private withAuthor(dir: string, author: GitAuthorIdentity): SimpleGit {
    return simpleGit(dir).env(gitAuthorEnv(author))
  }

  /**
   * Git client that authenticates to github.com with the app's OAuth token
   * (same mechanism GitHub Actions uses). Without this, push only works when
   * the user happens to have external git credentials configured.
   */
  private withGitHubAuth(dir?: string): SimpleGit {
    if (!this.githubToken) {
      return dir ? this.createGit(dir) : this.createGit()
    }
    const header = `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${this.githubToken}`).toString('base64')}`
    return this.createGit({
      baseDir: dir,
      config: [`http.https://github.com/.extraheader=${header}`]
    })
  }

  async clone(url: string, parentDir: string, dirName: string): Promise<string> {
    try {
      const git = this.withGitHubAuth(parentDir)
      const targetPath = join(parentDir, dirName)
      await git.clone(url, targetPath)
      return targetPath
    } catch (error) {
      console.error('Failed to clone repository:', error)
      throw error
    }
  }

  async status(dir: string): Promise<any> {
      try {
          const git = simpleGit(dir);
          const status = await git.status();
          return JSON.parse(JSON.stringify(status));
      } catch (error: any) {
          console.error('Failed to get status:', error);
          throw new Error(error?.message || 'Failed to get status');
      }
  }

  async add(dir: string, files: string[]): Promise<void> {
      try {
          const git = simpleGit(dir);
          await git.add(files);
      } catch (error) {
          console.error('Failed to add files:', error);
          throw error;
      }
  }

  async commit(dir: string, message: string, author: GitAuthorIdentity): Promise<void> {
      try {
          const git = this.withAuthor(dir, author);
          await git.commit(message);
      } catch (error) {
          console.error('Failed to commit:', error);
          throw error;
      }
  }

  /** Pull the current branch from origin (used to refresh a reused fork clone). */
  async pull(dir: string): Promise<void> {
      try {
          const git = this.withGitHubAuth(dir);
          await git.pull();
      } catch (error) {
          console.error('Failed to pull:', error);
          throw error;
      }
  }

  async push(dir: string): Promise<void> {
      try {
          const git = this.withGitHubAuth(dir);
          const { remote, branch } = await this.verifiedPushTarget(git)
          // An explicit refspec prevents push.default/matching or remote refspecs
          // from publishing additional branches.
          await git.push(remote, `HEAD:refs/heads/${branch}`);
      } catch (error) {
          console.error('Failed to push:', error);
          throw error;
      }
  }

  async currentBranch(dir: string): Promise<string> {
      try {
          const git = simpleGit(dir);
          const status = await git.status()
          if (!status.current) {
              throw new Error('No current branch')
          }
          return status.current
      } catch (error) {
          console.error('Failed to get current branch:', error);
          throw error;
      }
  }

  async pushWithUpstream(dir: string, branch: string): Promise<void> {
      try {
          const git = this.withGitHubAuth(dir);
          const target = await this.verifiedPushTarget(git, branch)
          if (target.remote !== 'origin') await this.verifyPushRemote(git, 'origin')
          await git.push('origin', `HEAD:refs/heads/${branch}`, { '--set-upstream': null })
      } catch (error) {
          console.error('Failed to push with upstream:', error);
          throw error;
      }
  }

  async readFileAtHead(repoDir: string, filePath: string): Promise<string> {
      try {
          const git = simpleGit(repoDir)
          const rel = filePath.startsWith('/') ? relative(repoDir, filePath) : filePath
          const content = await git.show([`HEAD:${rel}`])
          return content
      } catch (error) {
          return ''
      }
  }

  async discardFile(repoDir: string, filePath: string): Promise<void> {
      const git = simpleGit(repoDir)
      const rel = relative(repoDir, filePath)
      try {
          await git.checkout(['--', rel])
      } catch {
          await git.clean('f', ['--', rel])
      }
  }

  async discardAll(repoDir: string): Promise<void> {
      const git = simpleGit(repoDir)
      await git.checkout(['--', '.'])
      await git.clean('fd')
  }

  async getStatus(repoDir: string) {
    if (!existsSync(repoDir)) {
        throw new Error(`Repository not found at ${repoDir}`)
    }
    const git = simpleGit(repoDir)
    return await git.status()
  }

  async checkout(repoDir: string, branch: string, create: boolean = false) {
    const git = simpleGit(repoDir)
    if (create) {
        await git.checkoutLocalBranch(branch)
    } else {
        await git.checkout(branch)
    }
  }

  async diff(dir: string, staged: boolean = false): Promise<string> {
    const git = simpleGit(dir)
    const args = staged ? ['--staged'] : []
    return await git.diff(args)
  }

  async diffSummary(dir: string, staged: boolean = false): Promise<{ changed: number; insertions: number; deletions: number }> {
    const git = simpleGit(dir)
    const args = staged ? ['--staged'] : []
    const summary = await git.diffSummary(args)
    return { changed: summary.changed, insertions: summary.insertions, deletions: summary.deletions }
  }

  async listTrackedFiles(repoDir: string): Promise<string[]> {
    if (!existsSync(repoDir)) {
      throw new Error(`Repository not found at ${repoDir}`)
    }
    const git = simpleGit(repoDir)
    const output = await git.raw(['ls-files', '--cached', '--others', '--exclude-standard'])
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((relativePath) => join(repoDir, relativePath))
  }
}

export const gitService = new GitService()
