import { useEffect, useState, useMemo, type ReactNode } from 'react'
import { RefreshCw, GitCommitHorizontal, GitPullRequest, GitBranch, Search } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { useContributionHistoryStore } from '../../store/useContributionHistoryStore'
import { usePipelineStore, type PipelineEntry } from '../../store/usePipelineStore'
import { useIssueStore } from '../../store/useIssueStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useUIStore } from '../../store/useUIStore'
import { humanizeError } from '../../lib/user-errors'
import { clsx } from 'clsx'

type ContributionEvent = {
  id: string
  created_at: string
  repo_owner: string
  repo_name: string
  issue_number?: number
  pr_number?: number
  event_type: string
  metadata?: Record<string, unknown>
}

const EVENT_ICON: Record<string, ReactNode> = {
  'issue.claimed': <GitBranch className="h-4 w-4" />,
  'issue.selected': <GitBranch className="h-4 w-4" />,
  'workspace.reused': <GitBranch className="h-4 w-4" />,
  'branch.created': <GitBranch className="h-4 w-4" />,
  'fork.created': <GitBranch className="h-4 w-4" />,
  'clone.completed': <GitBranch className="h-4 w-4" />,
  'commit.created': <GitCommitHorizontal className="h-4 w-4" />,
  'push.completed': <GitCommitHorizontal className="h-4 w-4" />,
  'pr.created': <GitPullRequest className="h-4 w-4" />
}

const EVENT_LABEL: Record<string, string> = {
  'issue.claimed': 'Claim comment posted',
  'issue.selected': 'Issue selected',
  'workspace.reused': 'Existing workspace reused',
  'branch.created': 'Branch created',
  'fork.created': 'Fork created',
  'clone.completed': 'Repository cloned',
  'commit.created': 'Commit created',
  'push.completed': 'Changes pushed',
  'pr.created': 'Pull request created'
}

const summarizeMetadata = (event: ContributionEvent) => {
  const metadata = event.metadata || {}
  switch (event.event_type) {
    case 'issue.claimed':
      return 'Commented on the issue to claim it.'
    case 'issue.selected':
      return typeof metadata.title === 'string' ? metadata.title : 'Contribution workflow started from discovery.'
    case 'workspace.reused':
      return typeof metadata.path === 'string' ? `Reused local repo at ${metadata.path}` : 'Reused an existing local checkout.'
    case 'branch.created':
      return typeof metadata.branch === 'string' ? `Created branch ${metadata.branch}` : 'Created a working branch for this issue.'
    case 'fork.created':
      return typeof metadata.upstream === 'string' ? `Forked ${metadata.upstream}` : 'Forked upstream repository.'
    case 'clone.completed':
      return typeof metadata.path === 'string' ? `Cloned into ${metadata.path}` : 'Local clone is ready.'
    case 'commit.created':
      return typeof metadata.message === 'string' ? metadata.message : 'A new commit was created for this issue.'
    case 'push.completed':
      return typeof metadata.branch === 'string' ? `Branch ${metadata.branch} pushed to remote` : 'Latest branch was pushed.'
    case 'pr.created':
      return typeof metadata.title === 'string' ? metadata.title : 'Pull request opened on GitHub.'
    default:
      return 'Contribution activity synced from FocusFork.'
  }
}

const metadataLink = (event: ContributionEvent) => {
  const url = event.metadata?.url
  return typeof url === 'string' && url.startsWith('http') ? url : null
}

const FILTERS = ['All', 'Issues', 'Forks', 'Clones'] as const
type FilterType = typeof FILTERS[number]

const FILTER_TYPES: Record<FilterType, string[]> = {
  All: [],
  Issues: ['issue.selected'],
  Forks: ['fork.created'],
  Clones: ['clone.completed']
}

/** Merge local + backend events, de-duplicated by type/repo/issue within the same minute. */
const mergeEvents = (local: ContributionEvent[], remote: ContributionEvent[]): ContributionEvent[] => {
  const seen = new Set(
    local.map((e) => `${e.event_type}|${e.repo_owner}/${e.repo_name}|${e.issue_number ?? ''}|${(e.created_at || '').slice(0, 16)}`)
  )
  const merged = [...local]
  for (const event of remote) {
    const key = `${event.event_type}|${event.repo_owner}/${event.repo_name}|${event.issue_number ?? ''}|${(event.created_at || '').slice(0, 16)}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(event)
    }
  }
  return merged.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
}

const STAGE_META: Record<string, { label: string; className: string }> = {
  claimed: { label: 'Claimed · waiting for assignment', className: 'border-active/30 bg-active-soft text-active-text' },
  in_workspace: { label: 'In workspace', className: 'border-border bg-card-muted text-text-secondary' },
  pr_open: { label: 'PR open · awaiting review', className: 'border-active/30 bg-active-soft text-active-text' },
  merged: { label: 'Merged 🎉', className: 'border-success/30 bg-success-bg text-success' },
  closed: { label: 'Closed', className: 'border-border bg-card-muted text-text-muted' }
}

/** In-flight contributions: resume where you left off, or ask GitHub what changed. */
const PipelineSection = () => {
  const entries = usePipelineStore((state) => state.entries)
  const user = useAuthStore((state) => state.user)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [noteByKey, setNoteByKey] = useState<Record<string, string>>({})

  const list = useMemo(
    () => Object.values(entries).sort((a, b) => b.updatedAt - a.updatedAt),
    [entries]
  )
  if (list.length === 0) return null

  const setNote = (key: string, note: string) => setNoteByKey((prev) => ({ ...prev, [key]: note }))

  const checkStatus = async (entry: PipelineEntry) => {
    setBusyKey(entry.key)
    setNote(entry.key, '')
    const { patch } = usePipelineStore.getState()
    try {
      const owner = entry.issue.repository.owner.login
      const repo = entry.issue.repository.name
      if (entry.stage === 'pr_open' && entry.prNumber) {
        // The PR head lives on the user's fork; the PR itself lives upstream.
        const pr = await window.api.github.getPullRequest(owner, repo, entry.prNumber)
        if (pr.merged) {
          patch(entry.key, { stage: 'merged' })
          setNote(entry.key, 'Your pull request was merged. Congratulations!')
        } else if (pr.state === 'closed') {
          patch(entry.key, { stage: 'closed' })
          setNote(entry.key, 'The pull request was closed without merging.')
        } else {
          const feedback = pr.review_comments + pr.comments
          setNote(
            entry.key,
            feedback > 0
              ? `Still open — ${feedback} comment${feedback === 1 ? '' : 's'} on the PR. Resume to address feedback, push again, and the PR updates automatically.`
              : 'Still open — no review feedback yet. Check back later.'
          )
        }
      } else {
        const live = await window.api.github.getIssue(owner, repo, entry.issue.number)
        const mine = live.assignees.some((a) => a.login.toLowerCase() === (user?.login || '').toLowerCase())
        if (live.state === 'closed') {
          patch(entry.key, { stage: 'closed' })
          setNote(entry.key, 'The issue was closed — pick another one.')
        } else if (mine) {
          patch(entry.key, { assignedToMe: true })
          setNote(entry.key, 'You were assigned! Resume to fork, clone, and start working.')
        } else if (live.assignees.length > 0) {
          setNote(entry.key, `Assigned to ${live.assignees.map((a) => `@${a.login}`).join(', ')} — consider another issue.`)
        } else {
          setNote(entry.key, 'No assignment yet — maintainers can take a few days. You can start anyway if the repo allows it.')
        }
      }
    } catch (error) {
      setNote(entry.key, humanizeError(error, 'Could not check the status. Please retry.'))
    } finally {
      setBusyKey(null)
    }
  }

  const resume = (entry: PipelineEntry) => {
    useIssueStore.getState().setSelectedIssue(entry.issue)
    if (entry.repoPath) {
      useSettingsStore.getState().setActiveRepoPath(entry.repoPath)
      useUIStore.getState().setView('ide')
    } else {
      useUIStore.getState().setView('issues')
    }
  }

  return (
    <section className="mb-6" data-testid="pipeline-section">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[14px] font-semibold text-text-main">In progress</h2>
        <span className="text-[12px] text-text-muted">{list.length} contribution{list.length === 1 ? '' : 's'} in flight</span>
      </div>
      <div className="space-y-2.5">
        {list.map((entry) => {
          const meta = STAGE_META[entry.stage] || STAGE_META.in_workspace
          const done = entry.stage === 'merged' || entry.stage === 'closed'
          const note = noteByKey[entry.key]
          return (
            <article key={entry.key} data-testid="pipeline-card" className="rounded-[11px] border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={clsx('rounded-full border px-2.5 py-0.5 text-[11px] font-medium', meta.className)}>
                      {meta.label}
                    </span>
                    {entry.assignedToMe && entry.stage === 'claimed' && (
                      <span className="rounded-full border border-success/30 bg-success-bg px-2.5 py-0.5 text-[11px] font-medium text-success">
                        Assigned to you
                      </span>
                    )}
                    <span className="font-mono text-[11px] text-text-muted truncate">
                      {entry.issue.repository.full_name}#{entry.issue.number}
                    </span>
                  </div>
                  <div className="mt-1.5 text-[13.5px] font-semibold text-text-main line-clamp-1">{entry.issue.title}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {!done && (
                    <button
                      type="button"
                      data-testid="pipeline-check-btn"
                      disabled={busyKey === entry.key}
                      onClick={() => void checkStatus(entry)}
                      className="btn-secondary px-3 py-1.5 text-[12px]"
                    >
                      {busyKey === entry.key ? 'Checking…' : 'Check status'}
                    </button>
                  )}
                  {!done && (
                    <button
                      type="button"
                      data-testid="pipeline-resume-btn"
                      onClick={() => resume(entry)}
                      className="btn-primary px-3 py-1.5 text-[12px]"
                    >
                      Resume
                    </button>
                  )}
                  {(entry.prUrl || entry.claimUrl || entry.issue.html_url) && (
                    <button
                      type="button"
                      title="Open on GitHub"
                      onClick={() => void window.api.openExternal(entry.prUrl || entry.claimUrl || entry.issue.html_url)}
                      className="btn-ghost px-2 py-1.5 text-[12px]"
                    >
                      ↗
                    </button>
                  )}
                  {done && (
                    <button
                      type="button"
                      title="Remove from pipeline"
                      onClick={() => usePipelineStore.getState().remove(entry.key)}
                      className="btn-ghost px-2 py-1.5 text-[12px] text-text-muted hover:text-danger"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
              {note && <p className="mt-2.5 text-[12.5px] text-text-secondary">{note}</p>}
            </article>
          )
        })}
      </div>
    </section>
  )
}

export const ContributionsPage = () => {
  const { backendConnected, refreshBackendConnection } = useAuthStore()
  const localEvents = useContributionHistoryStore((state) => state.events)
  const [items, setItems] = useState<ContributionEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterType>('All')

  // Local history is always available — no account or backend needed.
  // A connected backend session only adds events synced from other devices.
  const load = async () => {
    setLoading(true)
    setError(null)
    try {
      let remote: ContributionEvent[] = []
      if (backendConnected) {
        try {
          const response = await window.api.platform.listContributions(100, 0)
          remote = Array.isArray(response?.items) ? response.items : []
        } catch {
          // Backend fetch is optional; keep local history.
        }
      }
      setItems(mergeEvents(localEvents, remote))
    } catch (loadError: unknown) {
      setError(humanizeError(loadError, 'Could not load your contribution history. Please try again.'))
      setItems(localEvents)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [backendConnected, localEvents])

  const filteredItems = useMemo(() => {
    let result = items
    const filterTypes = FILTER_TYPES[activeFilter]
    if (filterTypes.length > 0) {
      result = result.filter((e) => filterTypes.includes(e.event_type))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter((e) => {
        const label = EVENT_LABEL[e.event_type] || e.event_type
        const desc = summarizeMetadata(e)
        const repo = `${e.repo_owner}/${e.repo_name}`
        return label.toLowerCase().includes(q) || desc.toLowerCase().includes(q) || repo.toLowerCase().includes(q)
      })
    }
    return result
  }, [items, activeFilter, searchQuery])

  return (
    <div className="h-full flex flex-col page-enter">
      {/* Fixed header */}
      <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
        <div className="flex items-start justify-between gap-4 mb-1">
          <div>
            <h1 className="font-serif text-[25px] font-medium tracking-tight text-text-main">Contributions</h1>
            <p className="text-[13px] text-text-muted mt-1">Your OSS timeline, synced from the backend.</p>
          </div>
          <button
            onClick={() => void load()}
            className="btn-secondary px-3 py-2 text-[12.5px]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border border-border rounded-[10px] px-3 py-2 bg-surface mt-3 max-w-[360px]">
          <Search className="h-4 w-4 text-text-muted shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search your contribution history…"
            className="border-none outline-none bg-transparent text-[13px] text-text-main flex-1 placeholder:text-text-muted"
          />
        </div>

        {/* Filter chips */}
        <div className="flex gap-2 mt-3">
          {FILTERS.map((filter) => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={clsx(
                'text-[12.5px] font-semibold px-3.5 py-1.5 rounded-full border transition-colors',
                activeFilter === filter
                  ? 'border-text-main bg-primary text-primary-foreground'
                  : 'border-border bg-transparent text-text-muted hover:border-border-strong'
              )}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5">
        <PipelineSection />

        {loading && (
          <div className="shell-card p-6 text-[13px] text-text-muted text-center">Loading history…</div>
        )}

        {!loading && error && (
          <div className="rounded-[11px] border border-danger/30 bg-danger-bg p-4 space-y-3">
            <p className="text-[13px] text-danger font-semibold">Couldn't load your history</p>
            <p className="text-[12.5px] text-text-muted">{error}</p>
            {!backendConnected && (
              <button
                type="button"
                data-testid="contributions-reconnect-btn"
                onClick={() => void refreshBackendConnection().then(() => load())}
                className="btn-secondary px-3 py-2 text-[12.5px]"
              >
                Retry sync
              </button>
            )}
          </div>
        )}

        {!loading && !error && filteredItems.length === 0 && (
          <div className="empty-state">
            <p className="text-[13.5px] font-semibold text-text-main">No contributions yet</p>
            <p className="text-[13px] text-text-muted mt-2">Discover an issue, fork it, and ship your first PR.</p>
          </div>
        )}

        {!loading && !error && filteredItems.length > 0 && (
          <div data-testid="contribution-list" className="flex flex-col gap-2.5">
            {filteredItems.map((event) => {
              const iconColor = event.event_type.startsWith('fork') || event.event_type.startsWith('clone')
                ? 'text-active'
                : event.event_type.startsWith('pr')
                  ? 'text-success'
                  : 'text-text-secondary'
              return (
                <article key={event.id} className="flex gap-3.5 items-start p-4 border border-border rounded-[11px]">
                  <div className={clsx('mt-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-card-muted shrink-0', iconColor)}>
                    {EVENT_ICON[event.event_type] ?? <GitCommitHorizontal className="h-4 w-4" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3 mb-1">
                      <p className="text-[13.5px] font-semibold text-text-main">
                        {EVENT_LABEL[event.event_type] ?? event.event_type}
                      </p>
                      <time className="text-[11.5px] text-text-muted shrink-0">{new Date(event.created_at).toLocaleString()}</time>
                    </div>
                    <p className="text-[11.5px] text-text-muted font-mono mb-1">
                      {event.repo_owner}/{event.repo_name}
                      {typeof event.issue_number === 'number' ? ` · #${event.issue_number}` : ''}
                    </p>
                    <p className="text-[12.5px] text-text-muted leading-relaxed">{summarizeMetadata(event)}</p>
                    {metadataLink(event) && (
                      <button
                        type="button"
                        onClick={() => void window.api.openExternal(metadataLink(event)!)}
                        className="mt-2 text-[12px] font-medium text-text-main underline-offset-2 hover:underline"
                      >
                        View on GitHub
                      </button>
                    )}
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
