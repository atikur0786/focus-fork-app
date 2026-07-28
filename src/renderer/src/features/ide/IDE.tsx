import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Maximize2,
  MessageSquare,
  Minimize2,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  SquareArrowOutUpRight,
  TerminalSquare,
  X
} from 'lucide-react'
import clsx from 'clsx'
import { Group, Panel, usePanelRef } from 'react-resizable-panels'
import { defaultContext } from '../../agents/agent-context'
import { reviewerAgent } from '../../agents/reviewer-agent'
import { shipAgent } from '../../agents/ship-agent'
import { AIChatPanel } from '../../components/AIChatPanel'
import { ApprovalGate } from '../../components/ApprovalGate'
import { Terminal } from '../../components/Terminal'
import { WorkspacePreviewPanel } from '../../components/WorkspacePreviewPanel'
import { WorkspaceColumnSeparator, WorkspaceRowSeparator } from './WorkspacePanelSeparators'
import { ExplorerPanel, type FileNode } from './ExplorerPanel'
import { StatusBar } from './StatusBar'
import { useAuthStore } from '../../store/useAuthStore'
import { useSettingsStore } from '../../store/useSettingsStore'
import { useIssueStore } from '../../store/useIssueStore'
import { useUIStore } from '../../store/useUIStore'
import { useWorkflowEngineStore } from '../../store/useWorkflowEngineStore'
import { useContributionStore } from '../../store/useContributionStore'
import { trackContributionEvent } from '../../store/useContributionHistoryStore'
import { usePipelineStore } from '../../store/usePipelineStore'
import { useTerminalStore } from '../../store/useTerminalStore'
import { humanizeError } from '../../lib/user-errors'
import { buildWorkspaceSessionKey, buildWorkspaceSessionLabel } from '../../lib/workspace-session'
import { resolveRepoFilePath } from '../../lib/ai-code-edits'

type SearchResult = {
  path: string
  line: number
  column: number
  preview: string
}

type CreateKind = 'file' | 'folder' | null

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg']

const isImageFile = (path: string | null): boolean => {
  if (!path) return false
  const lower = path.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

const relativePath = (root: string | null, path: string): string => {
  if (!root) return path
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

const buildIssueBranchName = (issueNumber?: number, issueTitle?: string): string => {
  const slug = (issueTitle || 'focusfork-task')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return issueNumber ? `issue-${issueNumber}-${slug || 'task'}` : slug || 'focusfork-task'
}

const sortNodes = (nodes: FileNode[]): FileNode[] => {
  return [...nodes].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1
    }
    return a.name.localeCompare(b.name)
  })
}

const buildTree = async (basePath: string, depth: number = 1): Promise<FileNode[]> => {
  const entries = await window.api.fs.readDir(basePath)
  const nodes = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = `${basePath}/${entry.name}`
      const node: FileNode = {
        name: entry.name,
        path: fullPath,
        isDirectory: entry.isDirectory
      }
      if (entry.isDirectory && depth > 0) {
        try {
          node.children = await buildTree(fullPath, depth - 1)
        } catch {
          node.children = []
        }
      }
      return node
    })
  )
  return sortNodes(nodes)
}

const flattenFileNodes = (nodes: FileNode[]): FileNode[] => {
  return nodes.flatMap((node) => {
    if (!node.isDirectory) return [node]
    return [node, ...flattenFileNodes(node.children || [])]
  })
}

export function IDE(): React.JSX.Element {
  const { activeRepoPath, preferredEditorId } = useSettingsStore()
  const { selectedIssue } = useIssueStore()
  const { setView } = useUIStore()
  const { user, isAuthenticated, backendConnected } = useAuthStore()
  const { steps, activityTimeline, updateStep, addActivity } = useContributionStore()
  const { currentStep, transition, failStep } = useWorkflowEngineStore()

  const [tree, setTree] = useState<FileNode[]>([])
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set())
  const [selectedPath, setSelectedPath] = useState<string | null>(null)
  const [openTabs, setOpenTabs] = useState<string[]>([])
  const [activeTabPath, setActiveTabPath] = useState<string | null>(null)
  const [fileContents, setFileContents] = useState<Record<string, string>>({})
  const [imageSrc, setImageSrc] = useState<string | null>(null)
  const [repoError, setRepoError] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [searching, setSearching] = useState(false)
  const [gitStatus, setGitStatus] = useState<any>(null)
  const [branchName, setBranchName] = useState<string>('no-branch')
  const [newBranchName, setNewBranchName] = useState('')
  const [commitMessage, setCommitMessage] = useState('')
  const [gitBusy, setGitBusy] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string>('Ready')
  const [createKind, setCreateKind] = useState<CreateKind>(null)
  const [createName, setCreateName] = useState('')
  const [createBusy, setCreateBusy] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [pendingGitAction, setPendingGitAction] = useState<'commit' | 'push' | 'pr' | null>(null)
  const [approvalBusy, setApprovalBusy] = useState(false)
  const [commitSuggesting, setCommitSuggesting] = useState(false)
  const [prTitle, setPrTitle] = useState('')
  const [prBody, setPrBody] = useState('')
  const [prBaseBranch, setPrBaseBranch] = useState('main')
  const [prBusy, setPrBusy] = useState(false)
  const [pullRequests, setPullRequests] = useState<any[]>([])
  const [prStatusMessage, setPrStatusMessage] = useState<string>('No pull requests loaded yet.')
  const [showExplorerPanel, setShowExplorerPanel] = useState(true)
  const [showChatPanel, setShowChatPanel] = useState(true)
  const [showTerminalPanel, setShowTerminalPanel] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [terminalReposWithSession, setTerminalReposWithSession] = useState<Set<string>>(() => new Set())
  const explorerPanelRef = usePanelRef()
  const centerPanelRef = usePanelRef()
  const previewPanelRef = usePanelRef()
  const terminalPanelRef = usePanelRef()
  const [, setProposedPreviewPaths] = useState<Set<string>>(new Set())
  const imageUrlRef = useRef<string | null>(null)

  const dirtyPaths = useMemo(() => new Set<string>(), [])
  const repoName = activeRepoPath?.split('/').pop() || null
  const repoMismatch = selectedIssue && repoName && selectedIssue.repository.name !== repoName
  const hasTerminalSession = Boolean(activeRepoPath && terminalReposWithSession.has(activeRepoPath))
  const flatNodes = useMemo(() => flattenFileNodes(tree), [tree])
  const workspaceSessionKey = buildWorkspaceSessionKey({
    issueNumber: selectedIssue?.number,
    repoFullName: selectedIssue?.repository.full_name,
    repoPath: activeRepoPath
  })
  const workspaceSessionLabel = buildWorkspaceSessionLabel({
    issueNumber: selectedIssue?.number,
    issueTitle: selectedIssue?.title,
    repoFullName: selectedIssue?.repository.full_name,
    repoPath: activeRepoPath
  })
  const currentFilePath = activeTabPath
  const currentFileRelativePath = activeTabPath ? relativePath(activeRepoPath, activeTabPath) : null
  const currentFileIsChanged = Boolean(
    activeTabPath &&
      gitStatus?.files?.some(
        (f: any) => activeTabPath.endsWith(f.path) || activeTabPath.endsWith(f.from || '')
      )
  )

  const changedFiles = useMemo(() => {
    if (!gitStatus?.files) return []
    return gitStatus.files.map((file: any) => file.path as string)
  }, [gitStatus])

  useEffect(() => {
    if (!selectedIssue) return
    if (!prTitle) {
      setPrTitle(`Fix #${selectedIssue.number}: ${selectedIssue.title}`)
    }
    if (!prBody) {
      setPrBody(`Closes #${selectedIssue.number}\n\n## Summary\n\nAddresses ${selectedIssue.repository.full_name}#${selectedIssue.number}.\n\n## Changes\n\n- \n\n---\n*Contributed via [FocusFork](https://github.com/atikur0786/focus-fork-app)*`)
    }
    window.api.github
      .getRepoDetails(selectedIssue.repository.owner.login, selectedIssue.repository.name)
      .then((repo) => {
        if (repo?.default_branch) setPrBaseBranch(repo.default_branch)
      })
      .catch(() => {})
  }, [selectedIssue?.number])

  const ensureTerminalSession = (repoPath: string | null) => {
    if (!repoPath) return
    setTerminalReposWithSession((prev) => {
      if (prev.has(repoPath)) return prev
      const next = new Set(prev)
      next.add(repoPath)
      return next
    })
  }

  const openTerminalPanel = () => {
    ensureTerminalSession(activeRepoPath)
    setShowTerminalPanel(true)
    const panel = terminalPanelRef.current
    if (panel?.isCollapsed()) {
      panel.resize('28%')
    }
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('terminal:focus'))
    })
  }

  const toggleExplorerPanel = () => {
    const panel = explorerPanelRef.current
    if (!panel) {
      setShowExplorerPanel((value) => !value)
      return
    }
    if (panel.isCollapsed()) {
      panel.resize('22%')
      setShowExplorerPanel(true)
    } else {
      panel.collapse()
      setShowExplorerPanel(false)
    }
  }

  const toggleChatPanel = () => {
    const panel = previewPanelRef.current
    if (!panel) {
      setShowChatPanel((value) => !value)
      return
    }
    if (panel.isCollapsed()) {
      panel.resize('34%')
      setShowChatPanel(true)
    } else {
      panel.collapse()
      setShowChatPanel(false)
    }
  }

  const toggleTerminalPanel = () => {
    const panel = terminalPanelRef.current
    if (!panel) {
      if (showTerminalPanel) {
        setShowTerminalPanel(false)
      } else {
        openTerminalPanel()
      }
      return
    }
    if (panel.isCollapsed()) {
      openTerminalPanel()
    } else {
      panel.collapse()
      setShowTerminalPanel(false)
    }
  }

  const toggleChatExpanded = () => {
    const explorer = explorerPanelRef.current
    const center = centerPanelRef.current
    const chatPanel = previewPanelRef.current
    if (chatExpanded) {
      explorer?.resize('18%')
      center?.resize('48%')
      chatPanel?.resize('34%')
      setShowExplorerPanel(true)
      setShowChatPanel(true)
      setChatExpanded(false)
    } else {
      explorer?.collapse()
      center?.resize('30%')
      chatPanel?.resize('70%')
      setShowExplorerPanel(false)
      setShowChatPanel(true)
      setChatExpanded(true)
    }
  }

  const closeTerminalPanel = () => {
    terminalPanelRef.current?.collapse()
    setShowTerminalPanel(false)
  }

  const buildAgentContext = (
    overrides?: Partial<{
      repoPath: string | null
      activeFilePath: string | null
      branch: string | null
      step: typeof currentStep
    }>
  ) => ({
    ...defaultContext,
    selectedModelId: 'deepseek/deepseek-r1:free',
    currentStep: overrides?.step ?? currentStep,
    issue: selectedIssue
      ? {
          id: selectedIssue.id,
          number: selectedIssue.number,
          title: selectedIssue.title,
          body: selectedIssue.body,
          repoOwner: selectedIssue.repository.owner.login,
          repoName: selectedIssue.repository.name,
          repoFullName: selectedIssue.repository.full_name
        }
      : null,
    repo: {
      rootPath: overrides?.repoPath ?? activeRepoPath,
      activeFilePath: overrides?.activeFilePath ?? currentFilePath,
      branchName: overrides?.branch ?? branchName
    },
    auth: {
      isAuthenticated,
      userLogin: user?.login || null,
      backendConnected
    },
    timeline: activityTimeline.map((item) => ({
      id: item.id,
      at: item.timestamp,
      message: item.message,
      level: item.level
    })),
    metadata: {}
  })

  const trackContribution = async (
    eventType: string,
    metadata: Record<string, unknown> = {},
    prNumber?: number
  ) => {
    if (!selectedIssue) return
    trackContributionEvent({
      repo_owner: selectedIssue.repository.owner.login,
      repo_name: selectedIssue.repository.name,
      issue_number: selectedIssue.number,
      pr_number: prNumber,
      event_type: eventType,
      metadata
    })
  }

  const revokeImageUrl = () => {
    if (imageUrlRef.current) {
      URL.revokeObjectURL(imageUrlRef.current)
      imageUrlRef.current = null
    }
  }

  useEffect(() => {
    return () => {
      revokeImageUrl()
    }
  }, [])

  useEffect(() => {
    if (!selectedIssue) return
    setNewBranchName((current) => current || buildIssueBranchName(selectedIssue.number, selectedIssue.title))
  }, [selectedIssue])

  const loadTree = async () => {
    if (!activeRepoPath) {
      setTree([])
      setRepoError('Select a repository from Discover Issues first.')
      return
    }
    try {
      setRepoError(null)
      const nextTree = await buildTree(activeRepoPath)
      setTree(nextTree)
      setExpandedPaths(new Set([activeRepoPath]))
      const branch = await window.api.git.currentBranch(activeRepoPath)
      setBranchName(branch || 'no-branch')
      const status = await window.api.git.status(activeRepoPath)
      setGitStatus(status)
      if (branch && branch !== 'no-branch' && steps.branch !== 'success') {
        const validation = reviewerAgent.validateStep('branch_ready', buildAgentContext({ branch }))
        if (validation.ok) {
          updateStep('branch', 'success')
          transition('branch_ready', `Branch ${branch} is active.`, { branch })
        }
      }
    } catch (error) {
      setRepoError(humanizeError(error, 'Could not load this repository.'))
    }
  }

  useEffect(() => {
    void loadTree()
  }, [activeRepoPath])

  const openNode = async (node: FileNode) => {
    setSelectedPath(node.path)
    setProposedPreviewPaths((prev) => {
      if (!prev.has(node.path)) return prev
      const next = new Set(prev)
      next.delete(node.path)
      return next
    })
    if (node.isDirectory) return

    try {
      revokeImageUrl()
      if (isImageFile(node.path)) {
        const buffer = await window.api.fs.readFileBuffer(node.path)
        const blob = new Blob([buffer])
        const objectUrl = URL.createObjectURL(blob)
        imageUrlRef.current = objectUrl
        setImageSrc(objectUrl)
        setOpenTabs((prev) => prev.includes(node.path) ? prev : [...prev, node.path])
        setActiveTabPath(node.path)
        return
      }

      const content = await window.api.fs.readFile(node.path)
      setFileContents((prev) => ({ ...prev, [node.path]: content }))
      setImageSrc(null)
      setOpenTabs((prev) => prev.includes(node.path) ? prev : [...prev, node.path])
      setActiveTabPath(node.path)
      setStatusMessage(`Opened ${node.name}`)
      if (steps.code !== 'success') {
        const validation = reviewerAgent.validateStep('changes_ready', buildAgentContext({ activeFilePath: node.path }))
        if (validation.ok) {
          updateStep('code', 'success')
          transition('changes_ready', `Prepared ${relativePath(activeRepoPath, node.path)} for edits.`, { file: node.path })
        }
      }
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Could not open that file.'))
    }
  }

  const handleCreate = async () => {
    if (!createKind || !createName.trim() || !activeRepoPath) return
    try {
      setCreateBusy(true)
      setCreateError(null)
      const basePath = selectedPath && flatNodes.find((node) => node.path === selectedPath)?.isDirectory
        ? selectedPath
        : activeRepoPath
      const targetPath = `${basePath}/${createName.trim()}`
      if (createKind === 'file') {
        await window.api.fs.createFile(targetPath, '')
      } else {
        await window.api.fs.createDir(targetPath)
      }
      setStatusMessage(`${createKind === 'file' ? 'Created file' : 'Created folder'} ${createName.trim()}`)
      setCreateKind(null)
      setCreateName('')
      await loadTree()
    } catch (error) {
      setCreateError(humanizeError(error, 'Could not create that item.'))
    } finally {
      setCreateBusy(false)
    }
  }

  const [renameTarget, setRenameTarget] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null)

  const handleRenameFile = (path: string) => {
    const name = path.split('/').pop() || ''
    setRenameTarget(path)
    setRenameDraft(name)
  }

  const commitRename = async () => {
    if (!renameTarget || !renameDraft.trim()) {
      setRenameTarget(null)
      return
    }
    const dir = renameTarget.substring(0, renameTarget.lastIndexOf('/'))
    const newPath = `${dir}/${renameDraft.trim()}`
    if (newPath === renameTarget) {
      setRenameTarget(null)
      return
    }
    try {
      await window.api.fs.rename(renameTarget, newPath)
      if (activeTabPath === renameTarget) {
        setActiveTabPath(newPath)
        setOpenTabs((prev) => prev.map((p) => p === renameTarget ? newPath : p))
        const content = await window.api.fs.readFile(newPath)
        setFileContents((prev) => {
          const next = { ...prev }
          delete next[renameTarget]
          next[newPath] = content
          return next
        })
      }
      setStatusMessage(`Renamed to ${renameDraft.trim()}`)
      await loadTree()
      await refreshGitStatus()
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Could not rename.'))
    }
    setRenameTarget(null)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    try {
      await window.api.fs.delete(deleteTarget)
      if (openTabs.includes(deleteTarget)) {
        const remaining = openTabs.filter((p) => p !== deleteTarget)
        setOpenTabs(remaining)
        if (activeTabPath === deleteTarget) {
          setActiveTabPath(remaining.length > 0 ? remaining[remaining.length - 1] : null)
        }
      }
      setStatusMessage(`Deleted ${deleteTarget.split('/').pop()}`)
      await loadTree()
      await refreshGitStatus()
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Could not delete.'))
    }
    setDeleteTarget(null)
  }

  const handleSearch = async () => {
    if (!activeRepoPath || !searchQuery.trim()) {
      setSearchResults([])
      return
    }
    try {
      setSearching(true)
      const results = await window.api.fs.search(activeRepoPath, searchQuery.trim())
      setSearchResults(results || [])
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Search failed.'))
    } finally {
      setSearching(false)
    }
  }

  const refreshGitStatus = async () => {
    if (!activeRepoPath) return
    try {
      const status = await window.api.git.status(activeRepoPath)
      setGitStatus(status)
      const branch = await window.api.git.currentBranch(activeRepoPath)
      setBranchName(branch || 'no-branch')
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Could not refresh git status.'))
    }
  }

  const handleCommit = async () => {
    if (!activeRepoPath || !commitMessage.trim()) return
    try {
      setGitBusy(true)
      // Commit is valid whenever there are actual changes — regardless of
      // whether a file happens to be open in the built-in editor (users may
      // edit in an external IDE or via AI-applied edits).
      if (changedFiles.length === 0) {
        updateStep('commit', 'error')
        setStatusMessage('No changes to commit. Edit files first, then commit.')
        return
      }
      await window.api.git.add(activeRepoPath, ['.'])
      await window.api.git.commit(activeRepoPath, commitMessage.trim())
      updateStep('commit', 'success')
      setStatusMessage('Committed successfully')
      await refreshGitStatus()
      transition('committed', `Committed: ${commitMessage.trim()}`, { message: commitMessage.trim() })
      await trackContribution('commit.created', { message: commitMessage.trim() })
      addActivity(`Committed: ${commitMessage.trim()}`, 'success')
      setCommitMessage('')
    } catch (error) {
      const message = humanizeError(error, 'Could not commit.')
      updateStep('commit', 'error')
      failStep('committed', message, { action: 'commit' })
      setStatusMessage(message)
    } finally {
      setGitBusy(false)
    }
  }

  const handlePush = async () => {
    if (!activeRepoPath) return
    try {
      setGitBusy(true)
      await window.api.git.push(activeRepoPath)
      updateStep('commit', 'success')
      setStatusMessage('Pushed changes')
      await refreshGitStatus()
      const pushValidation = reviewerAgent.validateStep('pushed', buildAgentContext())
      if (!pushValidation.ok) {
        updateStep('commit', 'error')
        failStep('pushed', pushValidation.errors.join(' '), { action: 'push' })
        return
      }
      transition('pushed', `Pushed branch ${branchName} to remote.`, { branch: branchName })
      await trackContribution('push.completed', { branch: branchName })
      addActivity(`Pushed branch ${branchName}.`, 'success')
    } catch {
      if (branchName && branchName !== 'no-branch') {
        try {
          await window.api.git.pushWithUpstream(activeRepoPath, branchName)
          updateStep('commit', 'success')
          setStatusMessage('Pushed changes with upstream')
          await refreshGitStatus()
          const pushValidation = reviewerAgent.validateStep('pushed', buildAgentContext())
          if (!pushValidation.ok) {
            updateStep('commit', 'error')
            failStep('pushed', pushValidation.errors.join(' '), { action: 'push-upstream' })
            return
          }
          transition('pushed', `Pushed branch ${branchName} with upstream.`, { branch: branchName })
          await trackContribution('push.completed', {
            branch: branchName,
            mode: 'with-upstream'
          })
          addActivity(`Pushed branch ${branchName} with upstream.`, 'success')
        } catch (pushError) {
          setStatusMessage(humanizeError(pushError, 'Push failed.'))
          addActivity('Push failed — check your remote and permissions.', 'error')
        }
      } else {
        setStatusMessage('Push failed — no branch to push.')
        addActivity('Push failed — no active branch.', 'error')
      }
    } finally {
      setGitBusy(false)
    }
  }

  const handleGenerateCommitMessage = async () => {
    if (!activeRepoPath || changedFiles.length === 0) return
    try {
      setCommitSuggesting(true)
      const summary = changedFiles.map((file) => relativePath(activeRepoPath, file)).join(', ')
      const generated = await shipAgent.generateCommitMessage(buildAgentContext(), summary)
      setCommitMessage(generated)
      setStatusMessage('Generated commit message')
    } catch (error) {
      setStatusMessage(humanizeError(error, 'Could not generate a commit message.'))
    } finally {
      setCommitSuggesting(false)
    }
  }

  const handleCreateBranch = async () => {
    if (!activeRepoPath) return
    const targetBranch = newBranchName.trim()
    if (!targetBranch) {
      setStatusMessage('Enter a branch name before creating it.')
      return
    }
    try {
      setGitBusy(true)
      await window.api.git.checkout(activeRepoPath, targetBranch, true)
      await refreshGitStatus()
      updateStep('branch', 'success')
      transition('branch_ready', `Created and switched to branch ${targetBranch}.`, { branch: targetBranch })
      addActivity(`Created branch ${targetBranch}.`, 'success')
      await trackContribution('branch.created', { branch: targetBranch })
      if (selectedIssue) {
        await window.api.platform.upsertSession({
          repoOwner: selectedIssue.repository.owner.login,
          repoName: selectedIssue.repository.name,
          issueNumber: selectedIssue.number,
          status: 'active',
          branchName: targetBranch,
          metadata: { source: 'ide.create-branch' }
        })
      }
      setStatusMessage(`Branch ready: ${targetBranch}`)
    } catch (error) {
      const message = humanizeError(error, 'Could not create that branch.')
      updateStep('branch', 'error')
      failStep('branch_ready', message, { branch: targetBranch })
      setStatusMessage(message)
    } finally {
      setGitBusy(false)
    }
  }

  const handleRefreshPullRequests = async () => {
    if (!selectedIssue) return
    try {
      setPrBusy(true)
      const prs = await shipAgent.trackPRStatus(
        buildAgentContext(),
        selectedIssue.repository.owner.login,
        selectedIssue.repository.name
      )
      setPullRequests(Array.isArray(prs) ? prs : [])
      setPrStatusMessage(Array.isArray(prs) && prs.length > 0 ? 'Loaded open pull requests.' : 'No open pull requests found.')
    } catch (error) {
      const message = humanizeError(error, 'Could not load pull requests.')
      setPrStatusMessage(message)
    } finally {
      setPrBusy(false)
    }
  }

  const handleCreatePR = async () => {
    if (!selectedIssue || !user || !branchName || branchName === 'no-branch') {
      setPrStatusMessage('Create or switch to a branch before opening a pull request.')
      return
    }
    if (!prTitle.trim()) {
      setPrStatusMessage('Add a PR title before creating a pull request.')
      return
    }
    try {
      setPrBusy(true)
      try {
        await window.api.git.push(activeRepoPath!)
      } catch {
        try {
          await window.api.git.pushWithUpstream(activeRepoPath!, branchName)
        } catch (pushErr) {
          setPrStatusMessage('Push your branch to remote first. Push failed: ' + (pushErr instanceof Error ? pushErr.message : 'unknown error'))
          setPrBusy(false)
          return
        }
      }
      const pr = await shipAgent.createPR(buildAgentContext(), {
        owner: selectedIssue.repository.owner.login,
        repo: selectedIssue.repository.name,
        head: `${user.login}:${branchName}`,
        base: prBaseBranch.trim() || 'main',
        title: prTitle.trim(),
        body: prBody.trim() || undefined,
        issueNumber: selectedIssue.number
      })
      const validation = reviewerAgent.validateStep('pr_created', buildAgentContext())
      if (!validation.ok) {
        updateStep('pr', 'error')
        failStep('pr_created', validation.errors.join(' '), { action: 'create-pr' })
        setPrStatusMessage(validation.errors.join(' '))
        return
      }
      updateStep('pr', 'success')
      transition('pr_created', `Created pull request: ${pr?.html_url || pr?.url || prTitle.trim()}`, {
        branch: branchName,
        title: prTitle.trim()
      })
      await trackContribution(
        'pr.created',
        {
          branch: branchName,
          title: prTitle.trim(),
          url: pr?.html_url || pr?.url || ''
        },
        typeof pr?.number === 'number' ? pr.number : undefined
      )
      addActivity(`Created pull request: ${prTitle.trim()}`, 'success')
      usePipelineStore.getState().upsert(selectedIssue, {
        stage: 'pr_open',
        repoPath: activeRepoPath || undefined,
        prNumber: typeof pr?.number === 'number' ? pr.number : undefined,
        prUrl: pr?.html_url || pr?.url || undefined
      })
      setPrStatusMessage(pr?.html_url ? `Pull request created: ${pr.html_url}` : 'Pull request created successfully.')
      if (pr?.html_url) {
        await window.api.notification.show('Pull request created', pr.html_url)
      }
      await handleRefreshPullRequests()
    } catch (error) {
      const raw = error instanceof Error ? error.message : String(error)
      let message: string
      if (/already exists/i.test(raw)) {
        message = 'A pull request already exists for this branch. Check the PR list below.'
      } else if (/head.*not found/i.test(raw) || /No commits between/i.test(raw)) {
        message = 'GitHub cannot find your branch. Make sure you have pushed commits before creating a PR.'
      } else {
        message = humanizeError(error, 'Could not create the pull request.')
      }
      updateStep('pr', 'error')
      failStep('pr_created', message, { action: 'create-pr' })
      setPrStatusMessage(message)
    } finally {
      setPrBusy(false)
    }
  }

  const openInExternalIDE = async (pathOverride?: string | null) => {
    if (!activeRepoPath) return
    const target = pathOverride || activeRepoPath
    await window.api.fs.openEditor(target, preferredEditorId || undefined)
  }

  const handleApprovedGitAction = async () => {
    if (!pendingGitAction) return
    try {
      setApprovalBusy(true)
      if (pendingGitAction === 'commit') {
        await handleCommit()
      } else if (pendingGitAction === 'pr') {
        await handleCreatePR()
      } else {
        await handlePush()
      }
      setPendingGitAction(null)
    } finally {
      setApprovalBusy(false)
    }
  }

  const handleGitFileClick = (file: string) => {
    const fullPath = activeRepoPath ? `${activeRepoPath}/${file}` : file
    const match = flatNodes.find((node) => node.path === fullPath)
    if (match) void openNode(match)
  }

  return (
    <>
      <div className="relative flex h-full min-h-0 flex-col">
        <div className="shrink-0 flex items-center justify-between gap-3 border-b border-border bg-surface/80 px-4 py-2.5">
          <div className="min-w-0 flex items-center gap-2 text-sm">
            {selectedIssue ? (
              <>
                <span className="status-pill text-[11px]">#{selectedIssue.number}</span>
                <span className="truncate font-medium">{selectedIssue.title}</span>
              </>
            ) : (
              <span className="truncate font-medium">{activeRepoPath?.split('/').pop() || 'Workspace assistant'}</span>
            )}
            <span className="text-text-muted">·</span>
            <span className="truncate font-mono text-xs text-text-secondary">{branchName}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              data-testid="ide-toggle-explorer-btn"
              onClick={toggleExplorerPanel}
              className="btn-secondary px-3 py-1.5 text-xs"
            >
              {showExplorerPanel ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
              Files
            </button>
            <button
              type="button"
              data-testid="ide-toggle-terminal-btn"
              onClick={toggleTerminalPanel}
              className={clsx(
                'btn-secondary px-3 py-1.5 text-xs',
                showTerminalPanel && 'border-primary/30 bg-primary/8 text-text-main'
              )}
            >
              <TerminalSquare size={14} />
              Terminal
            </button>
            <button
              type="button"
              data-testid="ide-toggle-chat-btn"
              onClick={toggleChatPanel}
              className={clsx(
                'btn-secondary px-3 py-1.5 text-xs',
                showChatPanel && 'border-primary/30 bg-primary/8 text-text-main'
              )}
            >
              {showChatPanel ? <PanelRightClose size={14} /> : <PanelRightOpen size={14} />}
              <MessageSquare size={14} />
              AI Chat
            </button>
            <button
              type="button"
              data-testid="ide-toggle-chat-expand-btn"
              onClick={toggleChatExpanded}
              className={clsx(
                'btn-secondary px-3 py-1.5 text-xs',
                chatExpanded && 'border-primary/30 bg-primary/8 text-text-main'
              )}
              title={chatExpanded ? 'Exit focus mode' : 'Expand chat (focus mode)'}
            >
              {chatExpanded ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
              {chatExpanded ? 'Exit Focus' : 'Focus'}
            </button>
            <button
              type="button"
              data-testid="open-vscode-btn"
              onClick={() => void openInExternalIDE(currentFilePath || activeRepoPath)}
              disabled={!activeRepoPath}
              className="btn-secondary px-3 py-1.5 text-xs disabled:opacity-50"
            >
              <SquareArrowOutUpRight size={14} />
              Open in IDE
            </button>
          </div>
        </div>

        {repoMismatch && (
          <div className="shrink-0 flex items-center justify-between gap-3 border-b border-active/30 bg-active-soft px-4 py-2">
            <p className="text-[12px] text-active-text">
              <strong>Issue #{selectedIssue.number}</strong> belongs to <strong>{selectedIssue.repository.full_name}</strong>, but the workspace shows <strong>{repoName}</strong>. Fork & clone from Discover to work on this issue.
            </p>
            <button
              onClick={() => setView('issues')}
              className="btn-secondary text-[11px] px-3 py-1 shrink-0"
            >
              Go to Discover
            </button>
          </div>
        )}

        <Group
          id="workspace-main"
          orientation="horizontal"
          className="workspace-shell h-full w-full min-h-0 flex-1"
        >
          <Panel
            id="explorer"
            panelRef={explorerPanelRef}
            defaultSize="18%"
            minSize="14%"
            maxSize="32%"
            collapsible
            collapsedSize="0%"
            className="h-full min-h-0 overflow-hidden"
          >
            <ExplorerPanel
              activeRepoPath={activeRepoPath}
              repoName={repoName}
              branchName={branchName}
              tree={tree}
              expandedPaths={expandedPaths}
              onToggleExpanded={async (node) => {
                const isCollapsing = expandedPaths.has(node.path)
                setExpandedPaths((prev) => {
                  const next = new Set(prev)
                  if (next.has(node.path)) next.delete(node.path)
                  else next.add(node.path)
                  return next
                })
                if (!isCollapsing && node.isDirectory && (!node.children || node.children.length === 0)) {
                  try {
                    const children = await buildTree(node.path, 1)
                    setTree((prev) => {
                      const update = (nodes: FileNode[]): FileNode[] =>
                        nodes.map((n) => {
                          if (n.path === node.path) return { ...n, children }
                          if (n.children) return { ...n, children: update(n.children) }
                          return n
                        })
                      return update(prev)
                    })
                  } catch {
                    // directory unreadable
                  }
                }
              }}
              selectedPath={selectedPath}
              onSelectPath={setSelectedPath}
              currentFilePath={currentFilePath}
              dirtyPaths={dirtyPaths}
              flatNodes={flatNodes}
              repoError={repoError}
              onLoadTree={() => void loadTree()}
              onOpenNode={(node) => void openNode(node)}
              onOpenInIDE={(path) => void openInExternalIDE(path)}
              onCreateFile={() => {
                setCreateKind('file')
                setCreateName('')
                setCreateError(null)
              }}
              onCreateFolder={() => {
                setCreateKind('folder')
                setCreateName('')
                setCreateError(null)
              }}
              onRenameFile={handleRenameFile}
              onDeleteFile={(path) => setDeleteTarget(path)}
              searchQuery={searchQuery}
              onSearchQueryChange={setSearchQuery}
              onSearch={() => void handleSearch()}
              searching={searching}
              searchResults={searchResults}
              gitPanelProps={{
                newBranchName,
                onNewBranchNameChange: setNewBranchName,
                onCreateBranch: () => void handleCreateBranch(),
                gitBusy,
                changedFiles,
                onFileClick: handleGitFileClick,
                onRefreshGitStatus: () => void refreshGitStatus(),
                commitMessage,
                onCommitMessageChange: setCommitMessage,
                onCommit: () => setPendingGitAction('commit'),
                onGenerateCommitMessage: () => void handleGenerateCommitMessage(),
                commitSuggesting,
                onPush: () => setPendingGitAction('push'),
                prTitle,
                onPrTitleChange: setPrTitle,
                prBody,
                onPrBodyChange: setPrBody,
                prBaseBranch,
                onPrBaseBranchChange: setPrBaseBranch,
                prBusy,
                onCreatePR: () => setPendingGitAction('pr'),
                onRefreshPRs: () => void handleRefreshPullRequests(),
                pullRequests,
                prStatusMessage,
                repoPath: activeRepoPath,
                agentContext: buildAgentContext()
              }}
            />
          </Panel>

          <WorkspaceColumnSeparator />

          {/* Center: Editor + Terminal (vertically stacked) */}
          <Panel id="center" panelRef={centerPanelRef} defaultSize="48%" minSize="30%" className="h-full min-h-0 overflow-hidden">
            <Group
              id="workspace-center"
              orientation="vertical"
              className="workspace-shell h-full w-full min-h-0"
            >
              <Panel id="editor" defaultSize="100%" minSize="40%" className="h-full min-h-0 overflow-hidden">
                <div className="flex h-full min-h-0 flex-col bg-background">
                  {openTabs.length > 0 && (
                    <div className="shrink-0 flex items-center overflow-x-auto border-b border-border bg-surface/60" style={{ scrollbarWidth: 'none' }}>
                      {openTabs.map((tabPath) => {
                        const name = tabPath.split('/').pop() || tabPath
                        const isActive = tabPath === activeTabPath
                        return (
                          <div
                            key={tabPath}
                            className={clsx(
                              'group flex items-center gap-1 shrink-0 border-r border-border px-3 py-1.5 text-[11px] cursor-pointer transition-colors',
                              isActive ? 'bg-background text-text-main' : 'text-text-secondary hover:bg-surface-hover hover:text-text-main'
                            )}
                            onClick={() => {
                              setActiveTabPath(tabPath)
                              setSelectedPath(tabPath)
                              if (isImageFile(tabPath)) {
                                revokeImageUrl()
                                void window.api.fs.readFileBuffer(tabPath).then((buffer) => {
                                  const blob = new Blob([buffer])
                                  const url = URL.createObjectURL(blob)
                                  imageUrlRef.current = url
                                  setImageSrc(url)
                                })
                              } else {
                                setImageSrc(null)
                              }
                            }}
                            title={relativePath(activeRepoPath, tabPath)}
                          >
                            <span className="truncate max-w-[120px] font-mono">{name}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                const remaining = openTabs.filter((p) => p !== tabPath)
                                setOpenTabs(remaining)
                                if (activeTabPath === tabPath) {
                                  const next = remaining.length > 0 ? remaining[remaining.length - 1] : null
                                  setActiveTabPath(next)
                                  setSelectedPath(next)
                                  setImageSrc(null)
                                }
                              }}
                              className={clsx(
                                'rounded p-0.5 transition-colors',
                                isActive ? 'hover:bg-surface-hover' : 'opacity-0 group-hover:opacity-100 hover:bg-surface-hover'
                              )}
                            >
                              <X size={12} />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <WorkspacePreviewPanel
                    repoPath={activeRepoPath}
                    filePath={currentFilePath}
                    relativePath={currentFileRelativePath}
                    content={currentFilePath ? fileContents[currentFilePath] ?? '' : ''}
                    imageSrc={imageSrc}
                    isImage={isImageFile(currentFilePath)}
                    isChanged={currentFileIsChanged}
                    preferredEditorId={preferredEditorId}
                    upstreamRepoFullName={selectedIssue?.repository.full_name}
                    forkLogin={user?.login}
                    branchName={branchName}
                    issueNumber={selectedIssue?.number}
                    onOpenExternal={() => void openInExternalIDE(currentFilePath || activeRepoPath)}
                    onClose={() => {
                      if (!activeTabPath) return
                      const remaining = openTabs.filter((p) => p !== activeTabPath)
                      setOpenTabs(remaining)
                      const next = remaining.length > 0 ? remaining[remaining.length - 1] : null
                      setActiveTabPath(next)
                      setSelectedPath(next)
                      setImageSrc(null)
                    }}
                    onFileContentChanged={(path, newContent) => {
                      setFileContents((prev) => ({ ...prev, [path]: newContent }))
                      void refreshGitStatus()
                      setStatusMessage(`Saved ${relativePath(activeRepoPath, path)}`)
                    }}
                  />
                </div>
              </Panel>

              <WorkspaceRowSeparator />

              <Panel
                id="terminal"
                panelRef={terminalPanelRef}
                defaultSize="0%"
                minSize="18%"
                maxSize="55%"
                collapsible
                collapsedSize="0%"
                className="h-full min-h-0 overflow-hidden"
              >
                {hasTerminalSession && activeRepoPath ? (
                  <div className="flex h-full min-h-0 flex-col border-t border-border bg-[#141414]">
                    <div
                      className={clsx(
                        'flex shrink-0 items-center justify-between border-b border-border/80 px-3 py-1.5',
                        !showTerminalPanel && 'hidden'
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-xs font-medium text-zinc-200" data-testid="workspace-terminal-label">
                          Terminal · {repoName || 'repository'}
                        </p>
                        <p className="truncate font-mono text-[10px] text-zinc-500" title={activeRepoPath || undefined}>
                          {activeRepoPath || 'No active repository'}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          data-testid="ide-terminal-send-to-ai"
                          onClick={() => {
                            const output = useTerminalStore.getState().getRecentOutput(40)
                            if (!output.trim()) return
                            const prefill = `Here is my terminal output — help me fix any errors:\n\n\`\`\`\n${output}\n\`\`\``
                            window.dispatchEvent(new CustomEvent('focusfork:prefill-chat', { detail: prefill }))
                            if (!showChatPanel) toggleChatPanel()
                          }}
                          className="rounded-md px-1.5 py-1 text-[10px] font-medium text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100 flex items-center gap-1"
                          title="Send terminal output to AI chat"
                        >
                          <MessageSquare size={12} />
                          Send to AI
                        </button>
                        <button
                          type="button"
                          data-testid="ide-close-terminal-btn"
                          onClick={closeTerminalPanel}
                          className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
                          title="Hide terminal"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    </div>
                    <div
                      className={clsx('min-h-0 flex-1', !showTerminalPanel && 'h-0 overflow-hidden')}
                      data-testid="workspace-terminal"
                    >
                      <Terminal key={activeRepoPath} visible={showTerminalPanel} />
                    </div>
                  </div>
                ) : (
                  <div className="h-full" aria-hidden="true" />
                )}
              </Panel>
            </Group>
          </Panel>

          <WorkspaceColumnSeparator />

          {/* Right: AI Chat (collapsible) */}
          <Panel
            id="chat"
            panelRef={previewPanelRef}
            defaultSize="34%"
            minSize="22%"
            maxSize="70%"
            collapsible
            collapsedSize="0%"
            className="h-full min-h-0 overflow-hidden"
          >
            <main className="flex h-full min-h-0 min-w-0 flex-col bg-background border-l border-border">
              <AIChatPanel
                sessionKey={workspaceSessionKey}
                sessionLabel={workspaceSessionLabel}
                issueNumber={selectedIssue?.number}
                context={[
                  `repo=${selectedIssue?.repository.full_name || activeRepoPath || 'N/A'}`,
                  `issue=${selectedIssue ? `#${selectedIssue.number} ${selectedIssue.title}` : 'N/A'}`,
                  `file=${currentFilePath || 'N/A'}`,
                  `branch=${branchName}`
                ].join('\n')}
                title={selectedIssue ? `Issue #${selectedIssue.number} · FocusFork agent` : 'FocusFork agent'}
                issueTitle={selectedIssue?.title}
                issueBody={selectedIssue?.body || undefined}
                branchName={branchName}
                upstreamRepoFullName={selectedIssue?.repository.full_name}
                repoFullName={selectedIssue?.repository.full_name}
                repoPath={activeRepoPath}
                currentFilePath={currentFilePath}
                repoRootPath={activeRepoPath}
                currentFileContent={currentFilePath ? fileContents[currentFilePath] ?? null : null}
                openTabContents={Object.fromEntries(
                  openTabs
                    .filter((p) => fileContents[p] && p !== currentFilePath)
                    .map((p) => [p, fileContents[p]])
                )}
                onSessionActivity={(message, level) => addActivity(message, level)}
                onPreviewProposedFile={async (relPath, proposedContent) => {
                  if (!activeRepoPath) return
                  const absolutePath = resolveRepoFilePath(activeRepoPath, relPath)
                  setOpenTabs((prev) => prev.includes(absolutePath) ? prev : [...prev, absolutePath])
                  setActiveTabPath(absolutePath)
                  setSelectedPath(absolutePath)
                  setProposedPreviewPaths((prev) => new Set(prev).add(absolutePath))
                  setFileContents((prev) => ({ ...prev, [absolutePath]: proposedContent }))
                  setStatusMessage(`Previewing proposed changes for ${relPath}`)
                }}
                onOpenInIde={() => void openInExternalIDE(currentFilePath || activeRepoPath)}
                onRepositoryChanged={async () => {
                  await loadTree()
                  await refreshGitStatus()
                  if (currentFilePath) {
                    try {
                      const content = await window.api.fs.readFile(currentFilePath)
                      setFileContents((prev) => ({ ...prev, [currentFilePath]: content }))
                      setStatusMessage(`Updated ${relativePath(activeRepoPath, currentFilePath)}`)
                    } catch (error) {
                      setStatusMessage(humanizeError(error, 'Could not reload the open file.'))
                    }
                  }
                }}
              />
            </main>
          </Panel>
        </Group>

        <StatusBar
          statusMessage={statusMessage}
          branchName={branchName}
          currentFileRelativePath={currentFileRelativePath}
        />
      </div>

      {createKind && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setCreateKind(null) }}>
          <div className="w-[420px] max-w-[92vw] rounded-xl border border-border bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold text-text-main">Create new {createKind}</div>
            <div className="text-xs text-text-secondary mt-1">
              Base path: {selectedPath || activeRepoPath || 'N/A'}
            </div>
            <input
              data-testid="ide-create-input"
              autoFocus
              value={createName}
              onChange={(event) => setCreateName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void handleCreate()
                if (event.key === 'Escape') setCreateKind(null)
              }}
              placeholder={createKind === 'file' ? 'example.ts' : 'new-folder'}
              className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            {createError && <div className="mt-2 text-xs text-danger">{createError}</div>}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                data-testid="ide-create-cancel-btn"
                onClick={() => setCreateKind(null)}
                disabled={createBusy}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-main disabled:opacity-60 cursor-pointer"
              >
                Cancel
              </button>
              <button
                data-testid="ide-create-confirm-btn"
                onClick={() => void handleCreate()}
                disabled={createBusy}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover disabled:opacity-60 cursor-pointer"
              >
                {createBusy ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}

      {renameTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setRenameTarget(null) }}>
          <div className="w-[420px] max-w-[92vw] rounded-xl border border-border bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold text-text-main">Rename</div>
            <div className="text-xs text-text-secondary mt-1 truncate">{renameTarget}</div>
            <input
              autoFocus
              value={renameDraft}
              onChange={(e) => setRenameDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitRename()
                if (e.key === 'Escape') setRenameTarget(null)
              }}
              className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
            />
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setRenameTarget(null)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-main cursor-pointer">Cancel</button>
              <button onClick={() => void commitRename()} className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary-hover cursor-pointer">Rename</button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/40" onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null) }}>
          <div className="w-[420px] max-w-[92vw] rounded-xl border border-border bg-background p-4 shadow-xl">
            <div className="text-sm font-semibold text-text-main">Delete</div>
            <p className="text-xs text-text-secondary mt-2">
              Are you sure you want to delete <strong className="text-text-main">{deleteTarget.split('/').pop()}</strong>? This cannot be undone.
            </p>
            <div className="mt-4 flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-md border border-border px-3 py-1.5 text-xs text-text-secondary hover:text-text-main cursor-pointer">Cancel</button>
              <button onClick={() => void confirmDelete()} className="rounded-md bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 cursor-pointer">Delete</button>
            </div>
          </div>
        </div>
      )}

      <ApprovalGate
        actionLabel={
          pendingGitAction === 'commit'
            ? 'Create commit from current local changes'
            : pendingGitAction === 'pr'
              ? 'Create a pull request for the current branch'
              : 'Push current branch to remote'
        }
        description={
          pendingGitAction === 'commit'
            ? 'This will stage detected local changes and create a git commit in the active repository.'
            : pendingGitAction === 'pr'
              ? 'This will open a pull request against the upstream repository using the title, body, and base branch you provided.'
              : 'This will push your current branch to the configured remote and may publish your work publicly.'
        }
        isOpen={pendingGitAction !== null}
        isBusy={approvalBusy}
        onApprove={() => void handleApprovedGitAction()}
        onReject={() => {
          if (approvalBusy) return
          setPendingGitAction(null)
        }}
      />
    </>
  )
}
