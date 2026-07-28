import type { AgentContext } from './agent-context'

export interface CommitAndPushInput {
  dir: string
  message: string
  files?: string[]
  branch?: string
}

export interface PullRequestInput {
  owner: string
  repo: string
  head: string
  base: string
  title: string
  body?: string
  issueNumber?: number
}

export const shipAgent = {
  async generateCommitMessage(ctx: AgentContext, summary: string, diff?: string): Promise<string> {
    const context = [
      ctx.issue?.title ? `Issue: ${ctx.issue.title}` : '',
      ctx.issue?.repoFullName ? `Repo: ${ctx.issue.repoFullName}` : '',
      summary ? `Summary: ${summary}` : ''
    ].filter(Boolean).join('\n')

    if (diff) {
      try {
        const message = await window.api.platform.generateCommitMessage(diff, context)
        if (message) return message
      } catch {
        // Fall back to generic AI chat if the dedicated endpoint fails
      }
    }

    const response = await window.api.platform.aiChat({
      messages: [
        {
          role: 'user',
          content: [
            `Generate a concise conventional commit message for this work.`,
            `Issue: ${ctx.issue?.title || 'N/A'}`,
            `Summary: ${summary}`
          ].join('\n')
        }
      ],
      context: `repo=${ctx.issue?.repoFullName || 'unknown'}`,
      model: ctx.selectedModelId
    })

    if (response?.text) return response.text.trim()
    throw new Error(response?.message || 'Failed to generate commit message')
  },

  async commitAndPush(_ctx: AgentContext, input: CommitAndPushInput): Promise<void> {
    await window.gitAPI.commitAndPush(input.dir, input.message, input.files, input.branch)
  },

  async createPR(_ctx: AgentContext, input: PullRequestInput) {
    return window.api.github.createPullRequest(input)
  },

  async trackPRStatus(_ctx: AgentContext, owner: string, repo: string) {
    return window.api.github.listPullRequests({ owner, repo, state: 'open' })
  }
}
