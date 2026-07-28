import { useState, useEffect, useRef } from 'react'
import { Search, RotateCw, AlertCircle, ArrowUpRight, GitFork, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react'
import { useIssueStore } from '../../store/useIssueStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { trackContributionEvent } from '../../store/useContributionHistoryStore'
import { usePipelineStore, pipelineKey } from '../../store/usePipelineStore'
import { useAuthStore } from '../../store/useAuthStore'
import { useUIStore } from '../../store/useUIStore'
import { clsx } from 'clsx'
import { Issue } from '../../store/useIssueStore'
import { useContributionStore } from '../../store/useContributionStore'
import { useWorkflowEngineStore } from '../../store/useWorkflowEngineStore'
import { useAIStore } from '../../store/useAIStore'
import { ApprovalGate } from '../../components/ApprovalGate'
import { AiErrorNotice } from '../../components/AiErrorNotice'
import { ChatMarkdown } from '../../components/ChatMarkdown'
import { reviewerAgent } from '../../agents/reviewer-agent'
import { discoverAgent } from '../../agents/discover-agent'
import { codeGuideAgent } from '../../agents/code-guide-agent'
import { defaultContext } from '../../agents/agent-context'
import {
    buildIssueSearchQuery,
    getIssueSearchSortParams,
    DISCOVER_LANGUAGE_OPTIONS,
    type IssueSortMode,
    type IssueDifficultyFilter
} from '../../lib/issue-search'
import { AnalyzeIssueError, type AiErrorCode } from '../../lib/ai-errors'
import { humanizeError } from '../../lib/user-errors'
import { useTabActivityStore } from '../../store/useTabActivityStore'

const ISSUES_PER_PAGE = 30

/** Inline CSS var so .label-chip can tint itself with the GitHub label color. */
const labelChipStyle = (color?: string): React.CSSProperties | undefined =>
    color ? ({ '--label-color': `#${color.replace(/^#/, '')}` } as React.CSSProperties) : undefined

const formatCount = (value: number): string =>
    value >= 1000 ? `${(value / 1000).toFixed(value >= 10000 ? 0 : 1)}k` : String(value)

const timeAgo = (iso: string): string => {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
    if (!Number.isFinite(seconds) || seconds < 0) return ''
    if (seconds < 3600) return `${Math.max(1, Math.floor(seconds / 60))}m ago`
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
    if (seconds < 86400 * 30) return `${Math.floor(seconds / 86400)}d ago`
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function IssueListSkeleton({ count = 6 }: { count?: number }) {
    return (
        <>
            {Array.from({ length: count }).map((_, index) => (
                <div
                    key={index}
                    data-testid="issue-card-skeleton"
                    aria-hidden="true"
                    className="w-full rounded-xl border border-border bg-background p-3"
                >
                    <div className="flex items-start gap-2.5 animate-pulse">
                        <div className="h-8 w-8 rounded-lg bg-surface-hover shrink-0" />
                        <div className="min-w-0 flex-1 space-y-1.5">
                            <div className="h-2.5 w-1/2 rounded bg-surface-hover" />
                            <div className="h-3.5 w-full rounded bg-surface-hover" />
                            <div className="h-3.5 w-4/5 rounded bg-surface-hover" />
                            <div className="flex gap-1.5 pt-0.5">
                                <div className="h-3.5 w-12 rounded-full bg-surface-hover" />
                                <div className="h-3.5 w-16 rounded-full bg-surface-hover" />
                            </div>
                        </div>
                    </div>
                </div>
            ))}
        </>
    )
}

export const IssueBrowser = () => {
    const [query, setQuery] = useState('')
    const [issues, setIssues] = useState<Issue[]>([])
    const [page, setPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [hasNextPage, setHasNextPage] = useState(false)
    const [selectedLanguage, setSelectedLanguage] = useState<string>('all')
    const [selectedDifficulty, setSelectedDifficulty] = useState<IssueDifficultyFilter>('all')
    const [onlyGoodFirst, setOnlyGoodFirst] = useState(false)
    const [sortMode, setSortMode] = useState<IssueSortMode>('updated')
    const [repoScope, setRepoScope] = useState<'all' | 'big-tech' | 'popular-oss'>('all')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [approvalOpen, setApprovalOpen] = useState(false)
    const [claimApprovalOpen, setClaimApprovalOpen] = useState(false)
    const [claimText, setClaimText] = useState('')
    const [claimBusy, setClaimBusy] = useState(false)
    const [claimPostedUrl, setClaimPostedUrl] = useState<string | null>(null)
    const [claimError, setClaimError] = useState<string | null>(null)
    const [claimCheckBusy, setClaimCheckBusy] = useState(false)
    const [claimBlocked, setClaimBlocked] = useState<string | null>(null)
    const [claimWarning, setClaimWarning] = useState<string | null>(null)
    const [approvalBusy, setApprovalBusy] = useState(false)
    const [forkError, setForkError] = useState<string | null>(null)
    const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
    const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false)
    const [aiAnalysisError, setAiAnalysisError] = useState<string | null>(null)
    const [aiAnalysisErrorCode, setAiAnalysisErrorCode] = useState<AiErrorCode | undefined>(undefined)
    const activeSearchIdRef = useRef(0)
    const hasInitializedAutoSearchRef = useRef(false)
    const { selectedIssue, setSelectedIssue } = useIssueStore()
    const { setActiveRepoPath, workspaceRoot } = useSettingsStore()
    const { logout, isAuthenticated, hasHydratedAuth, user, backendConnected } = useAuthStore()
    const { setView } = useUIStore()
    const { initializeForIssue, updateStep, addActivity } = useContributionStore()
    const { currentStep, bindIssue, transition, failStep } = useWorkflowEngineStore()
    const { model: selectedModelId } = useAIStore()
    const setTabActivity = useTabActivityStore((state) => state.setTabActivity)

    useEffect(() => {
        if (isLoading) {
            setTabActivity('issues', { status: 'working', message: 'Searching issues…' })
            return
        }
        if (aiAnalysisLoading) {
            setTabActivity('issues', { status: 'working', message: 'Evaluating fit with AI…' })
            return
        }
        if (approvalBusy) {
            setTabActivity('issues', { status: 'working', message: 'Forking and cloning…' })
            return
        }
        if (selectedIssue) {
            setTabActivity('issues', { status: 'success', message: `Issue #${selectedIssue.number} selected` })
            return
        }
        setTabActivity('issues', { status: 'idle', message: '' })
    }, [aiAnalysisLoading, approvalBusy, isLoading, selectedIssue, setTabActivity])

    // Reset the claim composer whenever a different issue is selected.
    useEffect(() => {
        setClaimPostedUrl(null)
        setClaimError(null)
        setClaimBlocked(null)
        setClaimWarning(null)
        setClaimCheckBusy(false)
        setClaimText(
            "Hi! I'd like to work on this issue — could you assign it to me? I'll share progress or questions here as I go."
        )
    }, [selectedIssue?.id])

    /**
     * Live check before opening the claim composer. Search results can be
     * hours stale: the issue may have been closed, assigned, or resolved by a
     * merged PR since it was indexed.
     *
     * Blocked (no comment possible): issue closed, a linked PR merged, or
     * assigned to someone else who already has a PR up — the work is taken.
     * Warned (second explicit click required): assigned but no PR yet, or an
     * unassigned open PR — asking to help can still be legitimate there.
     */
    const preflightClaim = async () => {
        if (!selectedIssue) return
        // A warning is already showing for this issue and the user clicked
        // again ("Claim anyway") — they have seen it; open the composer modal.
        if (claimWarning) {
            setClaimApprovalOpen(true)
            return
        }
        setClaimCheckBusy(true)
        setClaimBlocked(null)
        try {
            const status = await window.api.github.checkClaimability(
                selectedIssue.repository.owner.login,
                selectedIssue.repository.name,
                selectedIssue.number
            )
            const mergedPr = status.linkedPullRequests.find((pr) => pr.merged)
            const openPr = status.linkedPullRequests.find((pr) => pr.state === 'open')
            const me = (user?.login || '').toLowerCase()
            const assignedToMe = status.assignees.some((a) => a.login.toLowerCase() === me)
            const assignedToOther = status.assignees.length > 0 && !assignedToMe
            const assigneeNames = status.assignees.map((a) => `@${a.login}`).join(', ')
            if (status.state === 'closed') {
                setClaimBlocked(
                    status.stateReason === 'not_planned'
                        ? 'This issue was closed as not planned — the maintainers decided not to pursue it. Pick another issue.'
                        : `This issue is already closed${mergedPr ? ` — resolved by PR #${mergedPr.number}` : ''}. Commenting now would just add noise. Pick another issue.`
                )
                return
            }
            if (mergedPr) {
                setClaimBlocked(
                    `PR #${mergedPr.number} for this issue was already merged — the work is done even though the issue is still open. Pick another issue.`
                )
                return
            }
            if (assignedToOther && openPr) {
                setClaimBlocked(
                    `This issue is taken: assigned to ${assigneeNames} and PR #${openPr.number} is already up. A claim comment here would just be noise. Pick another issue.`
                )
                return
            }
            if (assignedToOther) {
                setClaimWarning(
                    `This issue is now assigned to ${assigneeNames}. Claiming it is off the table — but you can comment to ask if help is welcome. Click again to continue.`
                )
                return
            }
            if (openPr) {
                setClaimWarning(
                    `PR #${openPr.number} is already open for this issue — someone may be ahead of you. Check the thread first, then click again to continue.`
                )
                return
            }
            setClaimApprovalOpen(true)
        } catch (error) {
            // The check itself failing should not lock the user out — warn and
            // require one more explicit click.
            setClaimWarning(humanizeError(error, 'Could not verify the latest issue status — check the thread on GitHub, then click again to continue.'))
        } finally {
            setClaimCheckBusy(false)
        }
    }

    const handleApprovedClaim = async () => {
        if (!selectedIssue || !claimText.trim()) {
            setClaimApprovalOpen(false)
            return
        }
        setClaimApprovalOpen(false)
        setClaimBusy(true)
        setClaimError(null)
        try {
            const comment = await window.api.github.commentOnIssue(
                selectedIssue.repository.owner.login,
                selectedIssue.repository.name,
                selectedIssue.number,
                claimText.trim()
            )
            setClaimPostedUrl(comment.html_url)
            usePipelineStore.getState().upsert(selectedIssue, { stage: 'claimed', claimUrl: comment.html_url })
            await trackContribution(selectedIssue, 'issue.claimed', { url: comment.html_url })
            addActivity(`Posted a claim comment on ${selectedIssue.repository.full_name}#${selectedIssue.number}.`, 'success')
        } catch (error) {
            setClaimError(humanizeError(error, 'Could not post the comment. Please try again.'))
        } finally {
            setClaimBusy(false)
        }
    }

    const buildAgentContext = (
        issueOverride?: Issue | null,
        repoPathOverride?: string | null,
        stepOverride?: typeof currentStep
    ) => ({
        ...defaultContext,
        selectedModelId,
        currentStep: stepOverride ?? currentStep,
        issue: issueOverride
            ? {
                id: issueOverride.id,
                number: issueOverride.number,
                title: issueOverride.title,
                body: issueOverride.body,
                repoOwner: issueOverride.repository.owner.login,
                repoName: issueOverride.repository.name,
                repoFullName: issueOverride.repository.full_name
            }
            : null,
        repo: {
            rootPath: repoPathOverride ?? useSettingsStore.getState().activeRepoPath,
            activeFilePath: null,
            branchName: null
        },
        auth: {
            isAuthenticated,
            userLogin: user?.login || null,
            backendConnected
        },
        timeline: [],
        metadata: {}
    })

    const trackContribution = async (
        issue: Issue,
        eventType: string,
        metadata: Record<string, unknown> = {}
    ) => {
        trackContributionEvent({
            repo_owner: issue.repository.owner.login,
            repo_name: issue.repository.name,
            issue_number: issue.number,
            event_type: eventType,
            metadata
        })
    }

    const buildSearchQuery = () =>
        buildIssueSearchQuery({
            keywords: query,
            language: selectedLanguage,
            difficulty: selectedDifficulty,
            onlyGoodFirst
        })

    const resetDiscoverPreview = () => {
        setSelectedIssue(null)
        setAiAnalysis(null)
        setAiAnalysisError(null)
        setAiAnalysisErrorCode(undefined)
    }

    const resetDiscoverResults = () => {
        setIssues([])
        setTotalCount(0)
        setHasNextPage(false)
        setPage(1)
    }

    const handleSearch = async (e?: React.FormEvent, pageOverride?: number) => {
        e?.preventDefault()
        if (!hasHydratedAuth || !isAuthenticated) {
            setIsLoading(false)
            return
        }
        const targetPage = pageOverride ?? page
        const searchId = Date.now()
        activeSearchIdRef.current = searchId
        setIsLoading(true)
        setError(null)
        try {
            const q = buildSearchQuery()
            const sortParams = getIssueSearchSortParams(sortMode)
            const response = await discoverAgent.searchIssues({
                query: q,
                page: targetPage,
                perPage: ISSUES_PER_PAGE,
                sort: sortParams.sort,
                order: sortParams.order
            })
            if (activeSearchIdRef.current !== searchId) return
            const nextIssues = response.items as Issue[]
            setIssues(nextIssues)
            setPage(response.page)
            setTotalCount(response.totalCount)
            setHasNextPage(response.hasNextPage)
            if (selectedIssue && !nextIssues.some((issue) => issue.id === selectedIssue.id)) {
                const pipelineEntry = usePipelineStore.getState().entries[pipelineKey(selectedIssue)]
                if (!pipelineEntry) {
                    resetDiscoverPreview()
                }
            }
            transition('discover', `Loaded page ${response.page} (${response.items.length} issues).`, { query: q })
            const validation = reviewerAgent.validateStep('discover', buildAgentContext(selectedIssue, null, 'discover'))
            if (!validation.ok) {
                failStep('discover', validation.errors.join(' '), { query: q })
            }
        } catch (err: any) {
            if (activeSearchIdRef.current !== searchId) return
            const message = err?.message || 'Failed to fetch issues'
            const friendlyMessage = humanizeError(err, 'Could not load issues. Please try again.')
            const lower = message.toLowerCase()
            const isGithubAuthExpired = lower.includes('github') && (
                lower.includes('authentication expired') ||
                lower.includes('not authenticated') ||
                lower.includes('unauthorized')
            )
            resetDiscoverResults()
            resetDiscoverPreview()
            if (isGithubAuthExpired) {
                await logout()
                setError('Your session expired. Please sign in again.')
                failStep('discover', 'Discovery failed due to expired authentication.', { reason: message })
                return
            }
            if (lower.includes('backend session expired')) {
                setError('Backend session expired. Open Settings and reconnect/sign in again.')
                failStep('discover', 'Discovery failed due to backend session expiry.', { reason: message })
                return
            }
            setError(friendlyMessage)
            failStep('discover', `Discovery failed: ${friendlyMessage}`, { query: buildSearchQuery() })
        } finally {
            if (activeSearchIdRef.current !== searchId) return
            setIsLoading(false)
        }
    }

    useEffect(() => {
        if (!hasHydratedAuth || !isAuthenticated) return
        if (!hasInitializedAutoSearchRef.current) {
            hasInitializedAutoSearchRef.current = true
            void handleSearch(undefined, 1)
            return
        }
        setPage(1)
        const timer = window.setTimeout(() => {
            void handleSearch(undefined, 1)
        }, 180)
        return () => window.clearTimeout(timer)
    }, [hasHydratedAuth, isAuthenticated, selectedLanguage, selectedDifficulty, onlyGoodFirst, sortMode, repoScope])

    const totalPages = Math.max(1, Math.ceil(totalCount / ISSUES_PER_PAGE))
    const rangeStart = totalCount === 0 ? 0 : (page - 1) * ISSUES_PER_PAGE + 1
    const rangeEnd = Math.min(page * ISSUES_PER_PAGE, totalCount)

    const filteredIssues = issues.filter((issue) => {
        if (repoScope !== 'all') {
            const owner = issue.repository.owner.login.toLowerCase()
            const bigTechOrgs = new Set(['microsoft', 'google', 'facebook', 'meta', 'vercel', 'netflix', 'aws', 'github'])
            const popularOssOrgs = new Set(['kubernetes', 'facebook', 'microsoft', 'vercel', 'vitejs', 'angular', 'nestjs', 'denoland', 'nodejs'])
            if (repoScope === 'big-tech' && !bigTechOrgs.has(owner)) return false
            if (repoScope === 'popular-oss' && !popularOssOrgs.has(owner)) return false
        }
        if (selectedDifficulty === 'any-labeled' && issue.labels.length === 0) return false
        return true
    })

    const getIssueFit = (issue: Issue) => {
        const bodyLength = (issue.body || '').length
        const labelNames = issue.labels.map((l) => l.name.toLowerCase())
        const hasTests = /(test|spec|unit)/i.test(issue.body || '') || labelNames.some((l) => l.includes('test'))
        const size = bodyLength < 700 ? 'Small' : bodyLength < 2000 ? 'Medium' : 'Large'
        const fitScore =
            (labelNames.some((l) => l.includes('good first')) ? 2 : 0) +
            (labelNames.some((l) => l.includes('help wanted')) ? 1 : 0) +
            (bodyLength > 100 ? 1 : 0)
        const fit = fitScore >= 3 ? 'High' : fitScore >= 2 ? 'Moderate' : 'Low'
        return { fit, size, hasTests }
    }

    const getAcceptanceChecklist = (issue: Issue): string[] => {
        const list: string[] = []
        list.push('Reproduce or confirm the current behavior in local environment.')
        list.push('Implement only the minimum code changes required by the issue.')
        if (/test|spec|unit/i.test(issue.body || '') || issue.labels.some((l) => /test|qa/i.test(l.name))) {
            list.push('Add or update tests related to the issue.')
        } else {
            list.push('Validate manually and document verification steps in PR.')
        }
        list.push(`Reference #${issue.number} in commit/PR description.`)
        return list
    }

    const getExpectedFiles = (issue: Issue): string[] => {
        const text = `${issue.title}\n${issue.body || ''}`.toLowerCase()
        const hints: string[] = []
        if (/(ui|frontend|css|style|layout|component)/.test(text)) hints.push('`src/components/*` or `src/renderer/*`')
        if (/(api|backend|server|endpoint|route)/.test(text)) hints.push('`src/main/services/*` or route handlers')
        if (/(test|spec|unit|integration)/.test(text)) hints.push('`**/*.test.*` or `**/*.spec.*`')
        if (/(doc|readme|guide)/.test(text)) hints.push('`README.md` or docs files')
        if (/(config|env|build|ci|workflow)/.test(text)) hints.push('config/build files (`package.json`, CI/workflow)')
        if (hints.length === 0) hints.push('Likely feature source files referenced by issue keywords')
        return hints.slice(0, 4)
    }

    const handleClearSelection = () => {
        resetDiscoverPreview()
    }

    const handleSelectIssue = async (issue: Issue) => {
        if (selectedIssue?.id === issue.id) {
            handleClearSelection()
            return
        }
        setSelectedIssue(issue)
        setAiAnalysis(null)
        setAiAnalysisError(null)
        setAiAnalysisErrorCode(undefined)
        initializeForIssue(issue.id)
        bindIssue(issue.id, issue.repository.full_name)
        const validation = reviewerAgent.validateStep('selected', buildAgentContext(issue, null, 'selected'))
        if (validation.ok) {
            transition('selected', `Issue #${issue.number} selected from discover list.`, {
                repo: issue.repository.full_name
            })
        } else {
            failStep('selected', validation.errors.join(' '), { issueId: issue.id })
        }
        addActivity(`Selected issue #${issue.number} from discovery list.`, 'info')
        try {
            await window.api.platform.upsertSession({
                repoOwner: issue.repository.owner.login,
                repoName: issue.repository.name,
                issueNumber: issue.number,
                status: 'active',
                metadata: { source: 'discover.select' }
            })
            await window.api.platform.addSessionEvent({
                eventType: 'issue.selected',
                payload: {
                    issueNumber: issue.number,
                    repo: issue.repository.full_name
                },
                idempotencyKey: `issue-select-${issue.id}`
            })
            await trackContribution(issue, 'issue.selected', {
                repoFullName: issue.repository.full_name,
                title: issue.title
            })
        } catch {
            // Preserve local workflow when backend sync is unavailable.
        }
    }

    const handleEvaluateFit = async () => {
        if (!selectedIssue) return
        setAiAnalysisLoading(true)
        setAiAnalysisError(null)
        setAiAnalysisErrorCode(undefined)
        try {
            const analysis = await codeGuideAgent.analyzeIssue(buildAgentContext(selectedIssue), {
                issueTitle: selectedIssue.title,
                issueBody: selectedIssue.body || undefined,
                repoPath: useSettingsStore.getState().activeRepoPath
            })
            setAiAnalysis(analysis)
            transition('selected', `AI fit analysis completed for issue #${selectedIssue.number}.`, {
                repo: selectedIssue.repository.full_name
            })
        } catch (error) {
            const errorCode = error instanceof AnalyzeIssueError ? error.errorCode : undefined
            setAiAnalysisErrorCode(errorCode)
            setAiAnalysisError(
                humanizeError(error, 'We could not analyze this issue. Please try again in a moment.')
            )
        } finally {
            setAiAnalysisLoading(false)
        }
    }

    const handleApprovedForkAndClone = async () => {
        if (!selectedIssue) return
        const { workspaceRoot } = useSettingsStore.getState()
        const user = useAuthStore.getState().user

        if (!workspaceRoot) {
            setForkError('Please select a workspace root directory in Settings first.')
            setApprovalOpen(false)
            return
        }

        if (!user) {
            setForkError('You must be logged in to contribute.')
            setApprovalOpen(false)
            return
        }

        setForkError(null)

        try {
            setApprovalBusy(true)
            const repoName = selectedIssue.repository.name
            const existingPath = `${workspaceRoot}/${repoName}`
            const exists = await window.api.fs.pathExists(`${existingPath}/.git`)
            if (exists) {
                updateStep('fork', 'success')
                updateStep('clone', 'success')
                const forkValidation = reviewerAgent.validateStep('forked', buildAgentContext(selectedIssue, existingPath, 'forked'))
                const cloneValidation = reviewerAgent.validateStep('cloned', buildAgentContext(selectedIssue, existingPath, 'cloned'))
                if (forkValidation.ok) {
                    transition('forked', 'Using previously forked repository from workspace.', { path: existingPath })
                }
                if (cloneValidation.ok) {
                    transition('cloned', 'Using existing local clone from workspace.', { path: existingPath })
                }
                await trackContribution(selectedIssue, 'workspace.reused', { path: existingPath })
                // Second contribution to this repo: refresh the fork so the new
                // branch starts from the latest upstream code, not last week's.
                try {
                    const details = await window.api.github.getRepoDetails(
                        selectedIssue.repository.owner.login,
                        selectedIssue.repository.name
                    )
                    const defaultBranch = details?.default_branch || 'main'
                    const sync = await window.api.github.syncFork(user.login, repoName, defaultBranch)
                    addActivity(
                        sync.merged
                            ? 'Synced your fork with the upstream repository.'
                            : `Fork sync skipped: ${sync.message}`,
                        sync.merged ? 'success' : 'info'
                    )
                    await window.api.git.pull(existingPath)
                    addActivity('Pulled the latest changes into your local clone.', 'success')
                } catch (refreshError) {
                    addActivity(
                        `Could not refresh the fork automatically (${refreshError instanceof Error ? refreshError.message : 'unknown error'}). You can pull manually from the Git panel.`,
                        'info'
                    )
                }
                addActivity(`Opened existing repo ${repoName} for issue #${selectedIssue.number}.`, 'success')
                usePipelineStore.getState().upsert(selectedIssue, { stage: 'in_workspace', repoPath: existingPath })
                setActiveRepoPath(existingPath)
                setView('ide')
                setApprovalOpen(false)
                return
            }

            try {
                await window.api.github.star(
                    selectedIssue.repository.owner.login,
                    selectedIssue.repository.name
                )
                addActivity(`Starred ${selectedIssue.repository.full_name}.`, 'success')
            } catch {
                addActivity('Could not star repository — continuing with fork.', 'info')
            }

            updateStep('fork', 'loading')
            await discoverAgent.forkRepo(defaultContext, {
                owner: selectedIssue.repository.owner.login,
                repo: selectedIssue.repository.name
            })
            updateStep('fork', 'success')
            const forkValidation = reviewerAgent.validateStep('forked', buildAgentContext(selectedIssue, null, 'forked'))
            if (!forkValidation.ok) {
                updateStep('fork', 'error')
                failStep('forked', forkValidation.errors.join(' '), {
                    repo: selectedIssue.repository.full_name
                })
                setApprovalOpen(false)
                return
            }
            transition('forked', `Forked ${selectedIssue.repository.full_name}.`, {
                upstream: selectedIssue.repository.full_name,
                forkOwner: user.login
            })
            await trackContribution(selectedIssue, 'fork.created', {
                upstream: selectedIssue.repository.full_name,
                forkOwner: user.login
            })
            addActivity(`Forked ${selectedIssue.repository.full_name} to ${user.login}.`, 'success')

            const repoUrl = `https://github.com/${user.login}/${selectedIssue.repository.name}.git`
            updateStep('clone', 'loading')
            const clonedPath = await discoverAgent.cloneRepo(defaultContext, {
                url: repoUrl,
                parentDir: workspaceRoot,
                dirName: selectedIssue.repository.name
            })
            updateStep('clone', 'success')
            const cloneValidation = reviewerAgent.validateStep('cloned', buildAgentContext(selectedIssue, clonedPath, 'cloned'))
            if (!cloneValidation.ok) {
                updateStep('clone', 'error')
                failStep('cloned', cloneValidation.errors.join(' '), { path: clonedPath })
                setApprovalOpen(false)
                return
            }
            transition('cloned', 'Repository cloned locally.', { path: clonedPath })
            usePipelineStore.getState().upsert(selectedIssue, { stage: 'in_workspace', repoPath: clonedPath })
            setActiveRepoPath(clonedPath)
            await trackContribution(selectedIssue, 'clone.completed', { path: clonedPath })
            addActivity(`Cloned repository into ${clonedPath}.`, 'success')

            await window.api.notification.show(
                'Contribution Ready',
                `Cloned ${selectedIssue.repository.name} to your workspace.`
            )
            setView('ide')
            setApprovalOpen(false)
        } catch (e: any) {
            console.error(e)
            updateStep('fork', 'error')
            updateStep('clone', 'error')
            failStep('forked', `Fork/clone failed: ${e?.message || 'unknown error'}`, {
                repo: selectedIssue.repository.full_name
            })
            addActivity(`Fork/clone failed for issue #${selectedIssue.number}.`, 'error')
            setForkError('Failed to fork or clone the repository. ' + humanizeError(e, 'Please try again.'))
        } finally {
            setApprovalBusy(false)
        }
    }

    return (
        <div className="h-full flex flex-col bg-background min-h-0 page-enter">
            <header className="shrink-0 border-b border-border bg-surface/60 px-6 py-3.5">
                <div className="flex flex-col gap-2.5 max-w-6xl mx-auto w-full">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <h1 className="text-[14px] font-semibold tracking-tight text-text-main">Discover</h1>
                            <p className="text-[12px] text-text-muted mt-0.5">
                                Find open issues, evaluate with AI, then fork and clone.
                            </p>
                        </div>
                        {totalCount > 0 && (
                            <span className="text-[11px] text-text-muted tabular-nums">
                                {totalCount.toLocaleString()} results
                            </span>
                        )}
                    </div>
                    <form
                        onSubmit={(e) => {
                            setPage(1)
                            void handleSearch(e, 1)
                        }}
                        className="relative"
                    >
                        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
                        <input
                            data-testid="issue-search-input"
                            type="text"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                            placeholder='Search issues — try "authentication", "label:help-wanted", or a repo name…'
                            className="input-field py-2.5 pl-10 pr-12 text-[13px]"
                        />
                        <button
                            data-testid="search-btn"
                            type="submit"
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary-hover"
                        >
                            {isLoading ? <RotateCw className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                        </button>
                    </form>

                    <div className="flex flex-wrap gap-1.5">
                        <select
                            value={selectedLanguage}
                            onChange={(e) => setSelectedLanguage(e.target.value)}
                            className="rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-border-strong"
                            data-testid="issue-language-filter"
                        >
                            <option value="all">All languages</option>
                            {DISCOVER_LANGUAGE_OPTIONS.map((lang) => (
                                <option key={lang} value={lang}>{lang}</option>
                            ))}
                        </select>
                        <select value={selectedDifficulty} onChange={(e) => setSelectedDifficulty(e.target.value as IssueDifficultyFilter)} className="rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-border-strong">
                            <option value="all">All difficulty</option>
                            <option value="good-first">Good first issue</option>
                            <option value="help-wanted">Help wanted</option>
                            <option value="any-labeled">Any labeled</option>
                        </select>
                        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as IssueSortMode)} className="rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-border-strong">
                            <option value="updated">Recently updated</option>
                            <option value="comments">Most discussed</option>
                            <option value="newest">Newest</option>
                            <option value="best">Best match</option>
                        </select>
                        <select value={repoScope} onChange={(e) => setRepoScope(e.target.value as typeof repoScope)} className="rounded-[8px] border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-secondary outline-none transition-colors focus:border-border-strong">
                            <option value="all">All repos</option>
                            <option value="big-tech">Big OSS companies</option>
                            <option value="popular-oss">Popular OSS orgs</option>
                        </select>
                        <label className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[11px] text-text-secondary cursor-pointer hover:bg-surface-hover transition-colors">
                            <input type="checkbox" checked={onlyGoodFirst} onChange={(e) => setOnlyGoodFirst(e.target.checked)} className="h-3 w-3 rounded" />
                            Good first only
                        </label>
                    </div>
                </div>
            </header>

            {error && (
                <div className="mx-5 mt-3 rounded-[11px] border border-danger/30 bg-danger-bg px-4 py-3 text-[13px] flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" />
                        {error}
                    </span>
                    <button
                        type="button"
                        data-testid="issue-search-retry-btn"
                        onClick={() => void handleSearch()}
                        disabled={isLoading}
                        className="btn-primary shrink-0 px-3 py-1.5 text-[12px]"
                    >
                        {isLoading ? 'Retrying…' : 'Try again'}
                    </button>
                </div>
            )}

            {!workspaceRoot && (
                <div className="mx-5 mt-3 rounded-[11px] border border-active/30 bg-active-soft px-4 py-3 text-[13px] text-active-text flex items-center justify-between gap-3">
                    <span>Choose a workspace folder before you fork and clone.</span>
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                const dir = await window.api.fs.selectDir()
                                if (dir) useSettingsStore.getState().setWorkspaceRoot(dir)
                            } catch {}
                        }}
                        className="shrink-0 btn-primary text-[12px] px-3 py-1.5"
                    >
                        Choose folder
                    </button>
                </div>
            )}

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[420px_1fr]">
                <section className="min-h-0 border-b lg:border-b-0 lg:border-r border-border flex flex-col">
                    <div className="shrink-0 px-4 py-2.5 border-b border-border text-[11px] text-text-muted flex items-center justify-between gap-2">
                        <span>
                            {isLoading && issues.length === 0
                                ? 'Loading open issues from GitHub…'
                                : totalCount > 0
                                  ? `Showing ${rangeStart}-${rangeEnd} of ${totalCount.toLocaleString()}`
                                  : `${filteredIssues.length} issues`}
                        </span>
                        {isLoading && (
                            <span className="inline-flex items-center gap-1" data-testid="issue-list-loading">
                                <RotateCw className="h-3 w-3 animate-spin" />
                                {issues.length > 0 ? 'Refreshing' : 'Loading'}
                            </span>
                        )}
                    </div>
                    <div className="flex-1 min-h-0 overflow-y-auto px-[22px] pb-[22px] pt-2.5 space-y-2.5">
                        {isLoading && filteredIssues.length === 0 && <IssueListSkeleton />}
                        {filteredIssues.map((issue) => {
                            const ownerInitial = issue.repository.owner.login.charAt(0).toUpperCase()
                            return (
                            <button
                                key={issue.id}
                                type="button"
                                data-testid="issue-card"
                                onClick={() => void handleSelectIssue(issue)}
                                className={clsx(
                                    'w-full text-left rounded-[11px] border p-[14px_16px] transition-colors',
                                    selectedIssue?.id === issue.id
                                        ? 'border-border-strong bg-surface'
                                        : 'border-border bg-background hover:border-border-strong'
                                )}
                            >
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="w-[19px] h-[19px] rounded-[6px] bg-primary flex items-center justify-center text-[10px] font-bold text-primary-foreground shrink-0">
                                        {ownerInitial}
                                    </div>
                                    <span className="font-mono text-[11px] text-text-muted truncate">
                                        {issue.repository.full_name} · #{issue.number}
                                    </span>
                                </div>
                                <div className="text-[14px] font-semibold text-text-main line-clamp-2 leading-snug mb-1.5">{issue.title}</div>
                                {issue.body && (
                                    <div className="text-[12.5px] text-text-muted leading-relaxed line-clamp-2 mb-2">
                                        {issue.body.replace(/[#*`\[\]]/g, '').slice(0, 140)}
                                    </div>
                                )}
                                <div className="flex flex-wrap items-center gap-1.5">
                                    {(issue.assignees?.length ?? 0) > 0 && (
                                        <span className="text-[11px] px-2.5 py-0.5 rounded-full border border-active/30 bg-active-soft text-active-text font-medium">
                                            Assigned
                                        </span>
                                    )}
                                    {issue.labels.slice(0, 3).map((label) => (
                                        <span
                                            key={label.name}
                                            className="label-chip text-[11px] px-2.5 py-0.5 rounded-full"
                                            style={labelChipStyle(label.color)}
                                        >
                                            {label.name}
                                        </span>
                                    ))}
                                </div>
                                <div className="mt-2 flex items-center gap-3 text-[11px] text-text-muted">
                                    {issue.repository.primaryLanguage?.name && (
                                        <span className="inline-flex items-center gap-1">
                                            <span
                                                className="h-2 w-2 rounded-full"
                                                style={{ backgroundColor: issue.repository.primaryLanguage.color || 'var(--color-active)' }}
                                            />
                                            {issue.repository.primaryLanguage.name}
                                        </span>
                                    )}
                                    {typeof issue.repository.stars === 'number' && issue.repository.stars > 0 && (
                                        <span>★ {formatCount(issue.repository.stars)}</span>
                                    )}
                                    {typeof issue.comments === 'number' && issue.comments > 0 && (
                                        <span>{issue.comments} comments</span>
                                    )}
                                    {issue.updated_at && <span className="ml-auto">{timeAgo(issue.updated_at)}</span>}
                                </div>
                            </button>
                        )})}
                        {!isLoading && filteredIssues.length === 0 && (
                            <div className="py-16 text-center text-sm text-text-muted">
                                {issues.length === 0 && totalCount > 0
                                    ? 'Results were found but could not be displayed. Try searching again.'
                                    : issues.length > 0
                                      ? 'No issues match your filters.'
                                      : 'No issues found for this search.'}
                            </div>
                        )}
                    </div>
                    {!isLoading && totalCount > ISSUES_PER_PAGE && (
                        <div className="shrink-0 px-3 py-2.5 border-t border-border flex items-center justify-between gap-2">
                            <button
                                type="button"
                                data-testid="issue-page-prev"
                                disabled={page <= 1 || isLoading}
                                onClick={() => void handleSearch(undefined, page - 1)}
                                className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-border rounded-lg hover:bg-surface-hover disabled:opacity-40"
                            >
                                <ChevronLeft className="h-3.5 w-3.5" />
                                Previous
                            </button>
                            <span className="text-xs text-text-muted" data-testid="issue-page-indicator">
                                Page {page} of {totalPages}
                            </span>
                            <button
                                type="button"
                                data-testid="issue-page-next"
                                disabled={!hasNextPage || isLoading}
                                onClick={() => void handleSearch(undefined, page + 1)}
                                className="inline-flex items-center gap-1 px-3 py-2 text-xs border border-border rounded-lg hover:bg-surface-hover disabled:opacity-40"
                            >
                                Next
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </section>

                <section className="min-h-0 overflow-y-auto">
                    {!selectedIssue ? (
                        <div className="h-full flex flex-col items-center justify-center gap-3.5 text-center text-text-muted">
                            <div className="w-[52px] h-[52px] rounded-full bg-card-muted flex items-center justify-center text-[20px]">&#8981;</div>
                            <div className="text-[16px] font-semibold text-text-main">Select an issue</div>
                            <div className="text-[13.5px]">Pick an issue from the list to evaluate fit and start contributing.</div>
                        </div>
                    ) : (
                        <div data-testid="issue-detail-panel" className="px-10 py-8 max-w-[760px]">
                            {/* Repo header */}
                            <div className="flex items-center gap-2.5 mb-4">
                                <div className="w-[30px] h-[30px] rounded-[9px] bg-primary flex items-center justify-center text-[12.5px] font-bold text-primary-foreground">
                                    {selectedIssue.repository.owner.login.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <button
                                        type="button"
                                        data-testid="issue-repo-link"
                                        onClick={() => void window.api.openExternal(`https://github.com/${selectedIssue.repository.full_name}`)}
                                        className="text-[13px] font-semibold text-text-main hover:underline underline-offset-2 cursor-pointer bg-transparent border-none p-0 text-left"
                                        title="Open the repository on GitHub"
                                    >
                                        {selectedIssue.repository.full_name}
                                    </button>
                                    <div className="font-mono text-[11px] text-text-muted">
                                        #{selectedIssue.number}
                                        {selectedIssue.repository.primaryLanguage?.name
                                            ? ` · ${selectedIssue.repository.primaryLanguage.name}`
                                            : ''}
                                        {typeof selectedIssue.repository.stars === 'number' && selectedIssue.repository.stars > 0
                                            ? ` · ★ ${formatCount(selectedIssue.repository.stars)}`
                                            : ''}
                                    </div>
                                </div>
                            </div>

                            {/* Serif title */}
                            <h2 className="font-serif text-[27px] font-medium leading-snug mb-4">{selectedIssue.title}</h2>

                            {/* Labels */}
                            <div className="flex flex-wrap gap-1.5 mb-5">
                                {selectedIssue.labels.slice(0, 5).map((label) => (
                                    <span
                                        key={label.name}
                                        className="label-chip text-[11.5px] px-2.5 py-1 rounded-full"
                                        style={labelChipStyle(label.color)}
                                    >
                                        {label.name}
                                    </span>
                                ))}
                            </div>

                            {/* Body */}
                            <div className="text-[13.5px] text-text-muted leading-relaxed mb-6 max-h-[400px] overflow-y-auto">
                                {selectedIssue.body ? (
                                    <ChatMarkdown content={selectedIssue.body} />
                                ) : (
                                    <p className="text-text-muted">No description provided.</p>
                                )}
                            </div>

                            {/* Fit / Size / Tests */}
                            <div className="grid grid-cols-3 gap-3 mb-5">
                                <div className="border border-border rounded-[11px] p-3.5">
                                    <div className="text-[11px] text-text-muted mb-1.5">FIT</div>
                                    <div className="text-[15px] font-semibold">{getIssueFit(selectedIssue).fit}</div>
                                </div>
                                <div className="border border-border rounded-[11px] p-3.5">
                                    <div className="text-[11px] text-text-muted mb-1.5">SIZE</div>
                                    <div className="text-[15px] font-semibold">{getIssueFit(selectedIssue).size}</div>
                                </div>
                                <div className="border border-border rounded-[11px] p-3.5">
                                    <div className="text-[11px] text-text-muted mb-1.5">TESTS</div>
                                    <div className="text-[15px] font-semibold">{getIssueFit(selectedIssue).hasTests ? 'Yes' : 'No'}</div>
                                </div>
                            </div>

                            {/* Assignment status + claim etiquette */}
                            <div className="mb-5 rounded-xl border border-border bg-card-muted/60 p-4" data-testid="issue-claim-section">
                                {(() => {
                                    const assignees = selectedIssue.assignees || []
                                    const mine = assignees.some((a) => a.login.toLowerCase() === (user?.login || '').toLowerCase())
                                    if (mine) {
                                        return (
                                            <div className="flex items-center gap-2 text-[13px] text-success">
                                                <span className="h-2 w-2 rounded-full bg-success" />
                                                Assigned to you — you're clear to start.
                                            </div>
                                        )
                                    }
                                    if (assignees.length > 0) {
                                        return (
                                            <div className="text-[13px] text-active-text">
                                                <span className="font-semibold">Already assigned to {assignees.map((a) => `@${a.login}`).join(', ')}.</span>{' '}
                                                Someone may be working on this — consider picking another issue, or comment to ask if you can help.
                                            </div>
                                        )
                                    }
                                    return (
                                        <div className="text-[13px] text-text-secondary">
                                            <span className="font-semibold text-text-main">Unassigned.</span> Good etiquette: comment to
                                            claim it so the maintainer can assign you before you invest time.
                                        </div>
                                    )
                                })()}

                                {claimPostedUrl ? (
                                    <div className="mt-3 space-y-2">
                                        <div className="flex items-center justify-between gap-3 text-[12.5px] text-success">
                                            <span>Comment posted — watch the issue for the maintainer's reply.</span>
                                            <button
                                                type="button"
                                                onClick={() => void window.api.openExternal(claimPostedUrl)}
                                                className="btn-secondary shrink-0 px-3 py-1.5 text-[12px]"
                                            >
                                                View on GitHub
                                            </button>
                                        </div>
                                        <p className="text-[11.5px] text-text-muted leading-relaxed">
                                            Check the GitHub issue or your <strong>History</strong> tab for assignment updates. Once the maintainer assigns you, come back and fork &amp; clone to start working.
                                        </p>
                                    </div>
                                ) : claimBlocked ? (
                                    <div className="mt-3 rounded-[9px] border border-danger/30 bg-danger-bg px-3.5 py-3" data-testid="claim-blocked-notice">
                                        <div className="text-[12.5px] text-danger">{claimBlocked}</div>
                                        <button
                                            type="button"
                                            onClick={() => void window.api.openExternal(selectedIssue.html_url)}
                                            className="btn-secondary mt-2.5 px-3 py-1.5 text-[12px]"
                                        >
                                            View the thread on GitHub
                                        </button>
                                    </div>
                                ) : (
                                    <div className="mt-3">
                                        {claimWarning && (
                                            <div className="mb-2 rounded-[9px] border border-active/30 bg-active-soft px-3 py-2 text-[12px] text-active-text" data-testid="claim-warning-notice">
                                                {claimWarning}
                                            </div>
                                        )}
                                        <textarea
                                            data-testid="claim-comment-input"
                                            value={claimText}
                                            onChange={(event) => setClaimText(event.target.value)}
                                            rows={2}
                                            className="w-full resize-none rounded-[9px] border border-border bg-background px-3 py-2 text-[12.5px] text-text-main outline-none focus:border-border-strong"
                                        />
                                        <div className="mt-2 flex items-center gap-2">
                                            <button
                                                type="button"
                                                data-testid="claim-comment-btn"
                                                disabled={claimBusy || claimCheckBusy || !isAuthenticated || !claimText.trim()}
                                                onClick={() => void preflightClaim()}
                                                className="btn-secondary px-3.5 py-2 text-[12.5px]"
                                            >
                                                {claimCheckBusy ? 'Checking issue status…' : claimBusy ? 'Posting…' : claimWarning ? 'Claim anyway' : 'Comment to claim'}
                                            </button>
                                            <span className="text-[11.5px] text-text-muted">
                                                Posts publicly as @{user?.login || 'you'} on GitHub.
                                            </span>
                                        </div>
                                        {claimError && <div className="mt-2 text-[12px] text-danger">{claimError}</div>}
                                    </div>
                                )}
                            </div>

                            {/* Action buttons */}
                            <div className="flex gap-2.5 mb-7">
                                <button
                                    data-testid="evaluate-fit-btn"
                                    disabled={aiAnalysisLoading}
                                    onClick={() => void handleEvaluateFit()}
                                    className="btn-secondary text-[14px] py-2.5 px-[18px]"
                                >
                                    {aiAnalysisLoading ? <RotateCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                                    Evaluate fit
                                </button>
                                <button
                                    data-testid="start-contribution-btn"
                                    onClick={() => setApprovalOpen(true)}
                                    disabled={!workspaceRoot || !isAuthenticated}
                                    className="btn-primary text-[14px] py-2.5 px-[18px]"
                                    title={!workspaceRoot ? 'Set a workspace directory in Settings first' : !isAuthenticated ? 'Sign in to contribute' : undefined}
                                >
                                    <GitFork className="h-4 w-4" />
                                    Star, fork & clone
                                </button>
                                <button
                                    data-testid="view-on-github-btn"
                                    onClick={() => void window.api.openExternal(selectedIssue.html_url)}
                                    className="btn-secondary text-[14px] py-2.5 px-[18px]"
                                    title="Open the issue thread on GitHub — read the comments before claiming"
                                >
                                    <ArrowUpRight className="h-4 w-4" />
                                    View on GitHub
                                </button>
                            </div>

                            {aiAnalysisError && (
                                <div className="mb-4">
                                    <AiErrorNotice
                                        errorCode={aiAnalysisErrorCode}
                                        message={aiAnalysisError}
                                        compact
                                    />
                                </div>
                            )}

                            {forkError && (
                                <div className="mb-4 flex items-start gap-2 rounded-xl border border-danger/30 bg-danger-bg px-3.5 py-2.5 text-[13px] text-danger">
                                    <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                                    <span>{forkError}</span>
                                </div>
                            )}

                            {/* "Why this fits you" AI card */}
                            {aiAnalysis && (
                                <div className="border border-border rounded-xl p-4 mb-4 bg-card-muted">
                                    <div className="flex items-center gap-1.5 text-[12.5px] font-semibold mb-1.5">
                                        <Sparkles className="h-3.5 w-3.5" /> Why this fits you
                                    </div>
                                    <div className="text-[13px] text-text-muted leading-relaxed">
                                        <ChatMarkdown content={aiAnalysis} />
                                    </div>
                                </div>
                            )}

                            {/* Checklist + Likely files */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="border border-border rounded-xl p-[18px]">
                                    <div className="text-[13px] font-semibold mb-3">Acceptance checklist</div>
                                    <div className="flex flex-col gap-2.5">
                                        {getAcceptanceChecklist(selectedIssue).map((item, idx) => (
                                            <div key={idx} className="flex gap-2 text-[13px] text-text-muted leading-relaxed">
                                                <span className="text-text-main shrink-0">·</span> {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <div className="border border-border rounded-xl p-[18px]">
                                    <div className="text-[13px] font-semibold mb-3">Likely files</div>
                                    <div className="flex flex-col gap-2.5">
                                        {getExpectedFiles(selectedIssue).map((item, idx) => (
                                            <div key={idx} className="flex gap-2 text-[13px] text-text-muted leading-relaxed">
                                                <span className="text-text-main shrink-0">·</span> {item}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </section>
            </div>

            <ApprovalGate
                actionLabel={selectedIssue ? `Star, fork and clone ${selectedIssue.repository.full_name}` : 'Star, fork and clone repository'}
                description="This will star the repository, fork it to your GitHub account, and clone it into your configured workspace so you can start contributing."
                isOpen={approvalOpen}
                isBusy={approvalBusy}
                onApprove={() => void handleApprovedForkAndClone()}
                onReject={() => { if (!approvalBusy) setApprovalOpen(false) }}
            />

            <ApprovalGate
                actionLabel={selectedIssue ? `Comment on ${selectedIssue.repository.full_name}#${selectedIssue.number}` : 'Comment on issue'}
                description={`This posts a public comment on GitHub as @${user?.login || 'you'}: "${claimText.trim().slice(0, 140)}"`}
                isOpen={claimApprovalOpen}
                isBusy={claimBusy}
                onApprove={() => void handleApprovedClaim()}
                onReject={() => { if (!claimBusy) setClaimApprovalOpen(false) }}
            />
        </div>
    )
}
