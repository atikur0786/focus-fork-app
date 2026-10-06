import type { AgentContext } from './agent-context'
import { buildAgentMissionPacket } from './agent-context'
import { AnalyzeIssueError, humanizeAiChatResult, isAiFailure, type AiChatResult } from '../lib/ai-errors'

export interface AnalyzeIssueInput {
  issueTitle: string
  issueBody?: string
  repoPath?: string | null
  filePath?: string | null
  fileContent?: string
}

const buildAnalysisPrompt = (ctx: AgentContext, input: AnalyzeIssueInput): string => {
  return [
    'You are the FocusFork Code Guide agent.',
    'Operate like a careful open-source maintainer pairing with a human contributor inside a desktop app.',
    'Your job is to turn the selected issue into a contribution plan the user can trust, claim, implement, review, and ship.',
    '',
    buildAgentMissionPacket(ctx),
    '',
    'Fresh issue input:',
    `Title: ${input.issueTitle}`,
    `Body: ${input.issueBody || 'N/A'}`,
    `Repo path override: ${input.repoPath || 'N/A'}`,
    `Current file override: ${input.filePath || 'N/A'}`,
    `Current file content: ${(input.fileContent || '').slice(0, 5000) || 'N/A'}`,
    '',
    'Return concise markdown with these exact sections:',
    '## Fit',
    '- State whether the issue looks claimable now, risky, or blocked. Mention missing facts plainly.',
    '## Contribution Guide',
    '- Identify likely repo docs to read first, conventions to follow, and how to avoid scope creep.',
    '## Work Plan',
    '- Give 3-6 concrete steps from local inspection to implementation.',
    '## Files To Inspect',
    '- List likely files or search terms. Say when this is an inference.',
    '## Verification',
    '- List exact tests, build checks, or manual checks to run.',
    '## Human Checkpoints',
    '- Name each action that must wait for user approval: claim comment, fork, clone, filesystem writes, commit, push, PR.',
    '## Risks',
    '- List blockers or assumptions that could make the plan wrong.',
    '',
    'Do not claim you edited files, ran commands, forked, cloned, committed, pushed, or opened a PR unless the app context proves it happened.'
  ].join('\n')
}

export const codeGuideAgent = {
  async analyzeIssue(ctx: AgentContext, input: AnalyzeIssueInput): Promise<string> {
    const response = await window.api.platform.aiChat({
      messages: [{ role: 'user', content: buildAnalysisPrompt(ctx, input) }],
      context: [
        `repo=${ctx.issue?.repoFullName || 'unknown'}`,
        `step=${ctx.currentStep}`,
        `branch=${ctx.repo.branchName || 'unknown'}`
      ].join('\n'),
      model: ctx.selectedModelId
    })

    if (response?.text?.trim()) {
      return response.text.trim()
    }

    if (isAiFailure(response as AiChatResult)) {
      const failed = response as AiChatResult
      throw new AnalyzeIssueError(
        humanizeAiChatResult(failed, 'We could not analyze this issue. Please try again.'),
        failed.errorCode
      )
    }

    throw new AnalyzeIssueError('We could not analyze this issue. Please try again.')
  }
}
