import * as vscode from 'vscode'
import { FocusForkApiClient } from '../apiClient'
import { SelectedIssue } from '../state'

type SessionItem = {
  id: string
  repo_owner?: string
  repo_name?: string
  issue_number?: number
  status?: string
  branch_name?: string
  updated_at?: string
}

type ContributionItem = {
  event_type?: string
  repo_owner?: string
  repo_name?: string
  issue_number?: number
  pr_number?: number
  created_at?: string
}

type WorkflowStepKey = 'login' | 'discover' | 'select' | 'fork' | 'clone' | 'edit' | 'test' | 'push' | 'pr'

class NodeItem extends vscode.TreeItem {
  constructor(
    label: string,
    description?: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None
  ) {
    super(label, collapsibleState)
    this.description = description
  }
}

export class WorkflowTreeProvider implements vscode.TreeDataProvider<NodeItem> {
  private readonly emitter = new vscode.EventEmitter<NodeItem | undefined | null | void>()
  private sessions: SessionItem[] = []
  private selectedIssue: SelectedIssue | null = null
  private stepStatus: Record<WorkflowStepKey, 'pending' | 'done'> = {
    login: 'pending',
    discover: 'pending',
    select: 'pending',
    fork: 'pending',
    clone: 'pending',
    edit: 'pending',
    test: 'pending',
    push: 'pending',
    pr: 'pending'
  }
  private loading = false
  private lastError: string | null = null

  readonly onDidChangeTreeData = this.emitter.event

  constructor(private readonly apiClient: FocusForkApiClient) {}

  refresh(): void {
    void this.load().finally(() => this.emitter.fire())
  }

  setSelectedIssue(issue: SelectedIssue | null): void {
    this.selectedIssue = issue
    this.stepStatus.select = issue ? 'done' : 'pending'
    this.emitter.fire()
  }

  setStepDone(step: WorkflowStepKey): void {
    this.stepStatus[step] = 'done'
    this.emitter.fire()
  }

  async load(): Promise<void> {
    this.loading = true
    this.lastError = null
    try {
      const data = await this.apiClient.get('/v1/sessions?limit=20&offset=0')
      this.sessions = Array.isArray(data?.items) ? (data.items as SessionItem[]) : []
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to load workflow sessions'
      this.sessions = []
    } finally {
      this.loading = false
    }
  }

  getTreeItem(element: NodeItem): vscode.TreeItem {
    return element
  }

  getChildren(): Promise<NodeItem[]> {
    if (this.loading) {
      return Promise.resolve([new NodeItem('Loading workflow...', '')])
    }
    if (this.lastError) {
      const item = new NodeItem('Workflow unavailable', this.lastError)
      item.iconPath = new vscode.ThemeIcon('error')
      return Promise.resolve([item])
    }
    const items: NodeItem[] = []
    if (this.selectedIssue) {
      const selected = new NodeItem(
        `Issue #${this.selectedIssue.number}: ${this.selectedIssue.title}`,
        this.selectedIssue.repository.full_name
      )
      selected.iconPath = new vscode.ThemeIcon('target')
      items.push(selected)
    } else {
      const notSelected = new NodeItem('No selected issue', 'Choose one from Discover Issues')
      notSelected.iconPath = new vscode.ThemeIcon('circle-outline')
      items.push(notSelected)
    }

    const orderedSteps: Array<[WorkflowStepKey, string]> = [
      ['login', 'Login'],
      ['discover', 'Discover Issues'],
      ['select', 'Select Issue'],
      ['fork', 'Fork/Clone'],
      ['clone', 'Open Repository'],
      ['edit', 'AI-guided edits'],
      ['test', 'Run tests'],
      ['push', 'Commit/Push'],
      ['pr', 'Create PR']
    ]
    orderedSteps.forEach(([key, label]) => {
      const done = this.stepStatus[key] === 'done'
      const item = new NodeItem(label, done ? 'done' : 'pending')
      item.iconPath = new vscode.ThemeIcon(done ? 'check' : 'circle-large-outline')
      items.push(item)
    })

    if (this.sessions.length === 0) {
      const item = new NodeItem('No active backend sessions', 'Session sync pending')
      item.iconPath = new vscode.ThemeIcon('warning')
      items.push(item)
      return Promise.resolve(items)
    }

    this.sessions.forEach((s) => {
        const repo = `${s.repo_owner ?? 'unknown'}/${s.repo_name ?? 'repo'}`
        const issue = s.issue_number ? `#${s.issue_number}` : 'no-issue'
        const status = s.status ?? 'active'
        const branch = s.branch_name ? ` · ${s.branch_name}` : ''
        const item = new NodeItem(`${repo} ${issue}`, `${status}${branch}`)
        item.tooltip = `${repo}\nIssue: ${issue}\nStatus: ${status}\nSession: ${s.id}`
        item.iconPath = new vscode.ThemeIcon(status === 'completed' ? 'check' : 'sync')
      items.push(item)
    })

    return Promise.resolve(items)
  }
}

export class ContributionsTreeProvider implements vscode.TreeDataProvider<NodeItem> {
  private readonly emitter = new vscode.EventEmitter<NodeItem | undefined | null | void>()
  private contributions: ContributionItem[] = []
  private loading = false
  private lastError: string | null = null

  readonly onDidChangeTreeData = this.emitter.event

  constructor(private readonly apiClient: FocusForkApiClient) {}

  refresh(): void {
    void this.load().finally(() => this.emitter.fire())
  }

  async load(): Promise<void> {
    this.loading = true
    this.lastError = null
    try {
      const data = await this.apiClient.get('/v1/contributions?limit=20&offset=0')
      this.contributions = Array.isArray(data?.items) ? (data.items as ContributionItem[]) : []
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : 'Failed to load contribution history'
      this.contributions = []
    } finally {
      this.loading = false
    }
  }

  getTreeItem(element: NodeItem): vscode.TreeItem {
    return element
  }

  getChildren(): Promise<NodeItem[]> {
    if (this.loading) {
      return Promise.resolve([new NodeItem('Loading contributions...', '')])
    }
    if (this.lastError) {
      const item = new NodeItem('Contribution history unavailable', this.lastError)
      item.iconPath = new vscode.ThemeIcon('error')
      return Promise.resolve([item])
    }
    if (this.contributions.length === 0) {
      const item = new NodeItem('No contribution events yet', 'Commit and open PR to track')
      item.iconPath = new vscode.ThemeIcon('history')
      return Promise.resolve([item])
    }
    return Promise.resolve(
      this.contributions.map((c) => {
        const repo = `${c.repo_owner ?? 'unknown'}/${c.repo_name ?? 'repo'}`
        const issue = c.issue_number ? `#${c.issue_number}` : ''
        const pr = c.pr_number ? `PR #${c.pr_number}` : ''
        const meta = [issue, pr].filter(Boolean).join(' · ')
        const item = new NodeItem(c.event_type ?? 'event', `${repo}${meta ? ` · ${meta}` : ''}`)
        item.iconPath = new vscode.ThemeIcon('git-commit')
        return item
      })
    )
  }
}
