import type { AgentContext } from './agent-context'
import { isAiFailure, type AiChatResult } from '../lib/ai-errors'

export type ReviewSeverity = 'critical' | 'warning' | 'suggestion'

export interface ReviewFinding {
  id: string
  severity: ReviewSeverity
  file: string
  line: number | null
  description: string
  suggestion: string | null
  acknowledged: boolean
}

export interface ReviewResult {
  findings: ReviewFinding[]
  summary: string
  reviewedAt: string
  model: string
}

let findingCounter = 0
const nextFindingId = (): string => `rf-${Date.now()}-${++findingCounter}`

const REVIEW_SYSTEM_PROMPT = `You are a senior code reviewer for open-source contributions. Your job is to review a git diff and identify issues that would cause a pull request to be rejected.

Focus on:
1. **Correctness** — logic errors, off-by-one, null/undefined access, race conditions
2. **Security** — injection, XSS, exposed secrets, unsafe deserialization, path traversal
3. **Error handling** — uncaught exceptions, missing validation at boundaries, silent failures
4. **Style & consistency** — naming, patterns that diverge from the surrounding code
5. **Test coverage** — changes that should have tests but don't

Do NOT flag:
- Formatting or whitespace issues
- Personal style preferences
- Suggestions that would require major refactoring beyond the scope of the diff

Respond with ONLY a JSON object in this exact format (no markdown fences, no explanation outside the JSON):
{
  "summary": "One-sentence overall assessment",
  "findings": [
    {
      "severity": "critical" | "warning" | "suggestion",
      "file": "relative/path/to/file",
      "line": 42,
      "description": "What is wrong and why it matters",
      "suggestion": "How to fix it (or null if obvious)"
    }
  ]
}

If the code looks good with no issues, return: { "summary": "No issues found. The changes look ready to commit.", "findings": [] }

Severity guide:
- critical: Will cause bugs, security issues, or data loss. Must fix before merging.
- warning: Likely to cause problems or indicates a code smell. Should fix.
- suggestion: Could be improved but acceptable as-is.`

const buildReviewPrompt = (diff: string, ctx: AgentContext): string => {
  const parts: string[] = []

  if (ctx.issue) {
    parts.push(`## Issue context`)
    parts.push(`Title: ${ctx.issue.title || 'N/A'}`)
    if (ctx.issue.body) {
      parts.push(`Description: ${ctx.issue.body.slice(0, 2000)}`)
    }
    parts.push('')
  }

  parts.push(`## Git diff to review`)
  parts.push(diff.slice(0, 60000))

  return parts.join('\n')
}

interface RawFinding {
  severity?: string
  file?: string
  line?: number | null
  description?: string
  suggestion?: string | null
}

const parseSeverity = (s: unknown): ReviewSeverity => {
  if (s === 'critical' || s === 'warning' || s === 'suggestion') return s
  return 'suggestion'
}

const parseFindings = (text: string): { summary: string; findings: ReviewFinding[] } => {
  const jsonMatch = text.match(/\{[\s\S]*"findings"[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      summary: text.slice(0, 200),
      findings: [{
        id: nextFindingId(),
        severity: 'suggestion',
        file: '',
        line: null,
        description: text.slice(0, 500),
        suggestion: null,
        acknowledged: false
      }]
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as { summary?: string; findings?: RawFinding[] }
    const findings: ReviewFinding[] = (parsed.findings || []).map((f) => ({
      id: nextFindingId(),
      severity: parseSeverity(f.severity),
      file: String(f.file || ''),
      line: typeof f.line === 'number' ? f.line : null,
      description: String(f.description || ''),
      suggestion: f.suggestion ? String(f.suggestion) : null,
      acknowledged: false
    }))

    return {
      summary: String(parsed.summary || 'Review complete.'),
      findings
    }
  } catch {
    return {
      summary: 'Review complete (could not parse structured response).',
      findings: [{
        id: nextFindingId(),
        severity: 'suggestion',
        file: '',
        line: null,
        description: text.slice(0, 500),
        suggestion: null,
        acknowledged: false
      }]
    }
  }
}

export const codeReviewAgent = {
  async reviewDiff(ctx: AgentContext, diff: string): Promise<ReviewResult> {
    if (!diff.trim()) {
      return {
        findings: [],
        summary: 'No changes to review.',
        reviewedAt: new Date().toISOString(),
        model: ctx.selectedModelId
      }
    }

    const response = await window.api.platform.aiChat({
      messages: [{ role: 'user', content: buildReviewPrompt(diff, ctx) }],
      context: REVIEW_SYSTEM_PROMPT,
      model: ctx.selectedModelId
    })

    if (isAiFailure(response as AiChatResult)) {
      const failed = response as AiChatResult
      throw new Error(
        failed.message || failed.errorCode || 'Code review failed. Please try again.'
      )
    }

    const text = response?.text?.trim() || ''
    if (!text) {
      throw new Error('Code review returned an empty response. Please try again.')
    }

    const { summary, findings } = parseFindings(text)

    return {
      findings,
      summary,
      reviewedAt: new Date().toISOString(),
      model: ctx.selectedModelId
    }
  }
}
