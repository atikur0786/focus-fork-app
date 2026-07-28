import type { AgentContext } from './agent-context'
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
    `Model: ${ctx.selectedModelId}`,
    `Step: ${ctx.currentStep}`,
    `Issue: ${input.issueTitle}`,
    `Issue body: ${input.issueBody || 'N/A'}`,
    `Repo path: ${input.repoPath || ctx.repo.rootPath || 'N/A'}`,
    `Current file: ${input.filePath || ctx.repo.activeFilePath || 'N/A'}`,
    `Current file content: ${(input.fileContent || '').slice(0, 4000) || 'N/A'}`,
    '',
    'Provide:',
    '1. issue summary',
    '2. likely files to change',
    '3. minimal step-by-step fix plan',
    '4. tests to run or add',
    '5. risks and assumptions'
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
