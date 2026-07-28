import { useState, useRef, useEffect } from 'react'
import {
  ChevronRight,
  FilePlus,
  Files,
  FolderPlus,
  GitGraph,
  ListChecks,
  Pencil,
  RefreshCw,
  Search,
  SquareArrowOutUpRight,
  Trash2
} from 'lucide-react'
import clsx from 'clsx'
import { ErrorBoundary } from '../../components/ErrorBoundary'
import { GitPanel } from './GitPanel'
import { WorkflowPanel } from './WorkflowPanel'
import { useIssueStore } from '../../store/useIssueStore'
import type { AgentContext } from '../../agents/agent-context'

type FileNode = {
  name: string
  path: string
  isDirectory: boolean
  children?: FileNode[]
}

type SearchResult = {
  path: string
  line: number
  column: number
  preview: string
}

type ExplorerTab = 'files' | 'search' | 'git' | 'workflow'

const relativePath = (root: string | null, path: string): string => {
  if (!root) return path
  return path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path
}

const FileTreeItem = ({
  node,
  level,
  expandedPaths,
  selectedPath,
  currentFilePath,
  dirtyPaths,
  onToggle,
  onSelect,
  onContextAction
}: {
  node: FileNode
  level: number
  expandedPaths: Set<string>
  selectedPath: string | null
  currentFilePath: string | null
  dirtyPaths: Set<string>
  onToggle: (node: FileNode) => void
  onSelect: (node: FileNode) => void
  onContextAction?: (action: 'rename' | 'delete' | 'open-ide', node: FileNode) => void
}) => {
  const isExpanded = expandedPaths.has(node.path)
  const isSelected = currentFilePath === node.path
  const isFocused = selectedPath === node.path
  const [showMenu, setShowMenu] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!showMenu) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showMenu])

  return (
    <div className="select-none relative">
      <button
        data-testid={node.isDirectory ? 'ide-folder-node' : 'ide-file-node'}
        onClick={() => {
          if (node.isDirectory) {
            onToggle(node)
          } else {
            onSelect(node)
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault()
          setMenuPos({ x: e.clientX, y: e.clientY })
          setShowMenu(true)
        }}
        className={clsx(
          'w-full flex items-center gap-1.5 py-1.5 px-2 text-left text-sm cursor-pointer transition-colors rounded-lg mx-1',
          isSelected && 'bg-primary/10 text-text-main ring-1 ring-primary/15',
          !isSelected && isFocused && 'bg-surface-hover text-text-main',
          !isSelected && !isFocused && 'text-text-secondary hover:bg-surface-hover'
        )}
        style={{ paddingLeft: `${level * 12 + 8}px` }}
      >
        <div
          className={clsx(
            'w-4 h-4 flex items-center justify-center transition-transform',
            isExpanded && 'rotate-90'
          )}
        >
          {node.isDirectory && (
            <ChevronRight size={12} strokeWidth={3} className="text-text-muted" />
          )}
        </div>
        <span className={clsx('truncate', node.isDirectory && 'font-medium text-text-main')}>
          {node.name}
        </span>
        {!node.isDirectory && dirtyPaths.has(node.path) && (
          <span className="ml-auto text-xs text-primary">●</span>
        )}
      </button>

      {showMenu && (
        <div
          ref={menuRef}
          className="fixed z-[100] min-w-[160px] rounded-lg border border-border bg-surface shadow-lg py-1"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          {!node.isDirectory && (
            <button
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-main transition-colors text-left"
              onClick={() => { setShowMenu(false); onContextAction?.('open-ide', node) }}
            >
              <SquareArrowOutUpRight size={12} /> Open in IDE
            </button>
          )}
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text-main transition-colors text-left"
            onClick={() => { setShowMenu(false); onContextAction?.('rename', node) }}
          >
            <Pencil size={12} /> Rename
          </button>
          <button
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[12px] text-danger hover:bg-danger-bg transition-colors text-left"
            onClick={() => { setShowMenu(false); onContextAction?.('delete', node) }}
          >
            <Trash2 size={12} /> Delete
          </button>
        </div>
      )}

      {node.isDirectory &&
        isExpanded &&
        node.children?.map((child) => (
          <FileTreeItem
            key={child.path}
            node={child}
            level={level + 1}
            expandedPaths={expandedPaths}
            selectedPath={selectedPath}
            currentFilePath={currentFilePath}
            dirtyPaths={dirtyPaths}
            onToggle={onToggle}
            onSelect={onSelect}
            onContextAction={onContextAction}
          />
        ))}
    </div>
  )
}

interface ExplorerPanelProps {
  activeRepoPath: string | null
  repoName: string | null
  branchName: string
  tree: FileNode[]
  expandedPaths: Set<string>
  onToggleExpanded: (node: FileNode) => void
  selectedPath: string | null
  onSelectPath: (path: string) => void
  currentFilePath: string | null
  dirtyPaths: Set<string>
  flatNodes: FileNode[]
  repoError: string | null
  onLoadTree: () => void
  onOpenNode: (node: FileNode) => void
  onOpenInIDE: (path?: string | null) => void
  onCreateFile: () => void
  onCreateFolder: () => void
  onRenameFile?: (path: string) => void
  onDeleteFile?: (path: string) => void
  // Search
  searchQuery: string
  onSearchQueryChange: (value: string) => void
  onSearch: () => void
  searching: boolean
  searchResults: SearchResult[]
  // Git panel props
  gitPanelProps: {
    newBranchName: string
    onNewBranchNameChange: (value: string) => void
    onCreateBranch: () => void
    gitBusy: boolean
    changedFiles: string[]
    onFileClick: (file: string) => void
    onRefreshGitStatus: () => void
    commitMessage: string
    onCommitMessageChange: (value: string) => void
    onCommit: () => void
    onGenerateCommitMessage: () => void
    commitSuggesting: boolean
    onPush: () => void
    prTitle: string
    onPrTitleChange: (value: string) => void
    prBody: string
    onPrBodyChange: (value: string) => void
    prBaseBranch: string
    onPrBaseBranchChange: (value: string) => void
    prBusy: boolean
    onCreatePR: () => void
    onRefreshPRs: () => void
    pullRequests: any[]
    prStatusMessage: string
    repoPath: string | null
    agentContext: AgentContext
  }
}

export const ExplorerPanel = ({
  activeRepoPath,
  repoName,
  branchName,
  tree,
  expandedPaths,
  onToggleExpanded,
  selectedPath,
  onSelectPath,
  currentFilePath,
  dirtyPaths,
  flatNodes,
  repoError,
  onLoadTree,
  onOpenNode,
  onOpenInIDE,
  onCreateFile,
  onCreateFolder,
  onRenameFile,
  onDeleteFile,
  searchQuery,
  onSearchQueryChange,
  onSearch,
  searching,
  searchResults,
  gitPanelProps
}: ExplorerPanelProps) => {
  const [activeTab, setActiveTab] = useState<ExplorerTab>('files')
  const { selectedIssue } = useIssueStore()

  return (
    <aside className="flex h-full min-h-0 flex-col bg-surface/80">
      <div className="shrink-0 border-b border-border bg-surface">
        <div className="flex items-start justify-between gap-2 px-3 py-2.5">
          <div className="min-w-0 flex-1">
            <p
              className="truncate text-sm font-semibold text-text-main"
              title={activeRepoPath || undefined}
              data-testid="workspace-repo-name"
            >
              {repoName || 'No repository'}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-text-muted">
              {branchName}
              {selectedIssue ? ` · #${selectedIssue.number}` : ''}
            </p>
          </div>
          <button
            type="button"
            data-testid="ide-refresh-btn"
            onClick={onLoadTree}
            className="shrink-0 rounded-md border border-border p-1.5 text-text-secondary hover:bg-surface-hover hover:text-text-main"
            title="Refresh repository"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="flex items-center gap-1 overflow-x-auto px-2 pb-2">
          {(
            [
              { id: 'files' as const, label: 'Files', icon: Files },
              { id: 'search' as const, label: 'Search', icon: Search },
              { id: 'git' as const, label: 'Git', icon: GitGraph },
              { id: 'workflow' as const, label: 'Flow', icon: ListChecks }
            ] as const
          ).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              data-testid={`ide-tab-${id}`}
              onClick={() => setActiveTab(id)}
              className={clsx(
                'inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors',
                activeTab === id
                  ? 'bg-primary/10 text-text-main ring-1 ring-primary/15'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text-main'
              )}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </div>

      {!activeRepoPath && (
        <div className="border-b border-border px-3 py-2">
          <div className="status-pill border-active/30 bg-active-soft text-active-text">
            Select a repo from Discover
          </div>
        </div>
      )}

      <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
        {activeTab === 'files' && (
          <>
            <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
              <button
                data-testid="ide-new-file-btn"
                onClick={onCreateFile}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-main"
                title="New file"
              >
                <FilePlus size={14} />
                File
              </button>
              <button
                data-testid="ide-new-folder-btn"
                onClick={onCreateFolder}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-main"
                title="New folder"
              >
                <FolderPlus size={14} />
                Folder
              </button>
              <button
                data-testid="ide-open-repo-btn"
                onClick={() => onOpenInIDE(activeRepoPath)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] text-text-secondary hover:bg-surface-hover hover:text-text-main"
              >
                <SquareArrowOutUpRight size={12} />
                Open
              </button>
            </div>
            <div className="flex-1 overflow-auto">
              {repoError ? (
                <div className="p-4 text-sm text-danger">{repoError}</div>
              ) : (
                tree.map((node) => (
                  <FileTreeItem
                    key={node.path}
                    node={node}
                    level={0}
                    expandedPaths={expandedPaths}
                    selectedPath={selectedPath}
                    currentFilePath={currentFilePath}
                    dirtyPaths={dirtyPaths}
                    onToggle={(nextNode) => {
                      onToggleExpanded(nextNode)
                      onSelectPath(nextNode.path)
                    }}
                    onSelect={(nextNode) => onOpenNode(nextNode)}
                    onContextAction={(action, actionNode) => {
                      if (action === 'rename') onRenameFile?.(actionNode.path)
                      else if (action === 'delete') onDeleteFile?.(actionNode.path)
                      else if (action === 'open-ide') onOpenInIDE(actionNode.path)
                    }}
                  />
                ))
              )}
            </div>
          </>
        )}

        {activeTab === 'search' && (
          <div className="p-4 flex flex-col gap-3 min-h-0 flex-1">
            <div className="flex items-center gap-2">
              <input
                data-testid="ide-search-input"
                value={searchQuery}
                onChange={(event) => onSearchQueryChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') onSearch()
                }}
                placeholder="Search within active repository"
                className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-primary"
              />
              <button
                data-testid="ide-search-btn"
                onClick={onSearch}
                className="rounded-md bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary-hover cursor-pointer"
              >
                {searching ? 'Searching...' : 'Search'}
              </button>
            </div>
            <div className="text-xs text-text-secondary">
              {searchResults.length > 0
                ? `${searchResults.length} matches found`
                : 'Search file names and content in the selected repo.'}
            </div>
            <div className="flex-1 overflow-auto rounded-lg border border-border bg-background">
              {searchResults.length === 0 ? (
                <div className="p-4 text-sm text-text-secondary">No matches yet.</div>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={`${result.path}:${result.line}:${result.column}`}
                    data-testid="ide-search-result"
                    onClick={() => {
                      const match = flatNodes.find((node) => node.path === result.path)
                      if (match) onOpenNode(match)
                    }}
                    className="w-full text-left border-b border-border px-4 py-3 hover:bg-surface-hover cursor-pointer"
                  >
                    <div className="text-xs text-text-muted">
                      {relativePath(activeRepoPath, result.path)}:{result.line}:{result.column}
                    </div>
                    <div className="text-sm text-text-main mt-1 whitespace-pre-wrap">
                      {result.preview}
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {activeTab === 'git' && (
          <ErrorBoundary fallbackLabel="Git panel crashed">
            <GitPanel branchName={branchName} {...gitPanelProps} />
          </ErrorBoundary>
        )}

        {activeTab === 'workflow' && <WorkflowPanel />}
      </div>
    </aside>
  )
}

export type { FileNode, SearchResult }
