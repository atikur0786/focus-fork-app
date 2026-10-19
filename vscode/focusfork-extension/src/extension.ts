import * as vscode from 'vscode'
import { FocusForkApiClient } from './apiClient'
import { GitHubClient } from './githubClient'
import { commitAndPush, detectTestCommand, getWorkspacePath, runCommand } from './gitWorkflow'
import { DiscoverIssuesViewProvider } from './views/discoverIssuesView'
import { AIAssistantViewProvider } from './views/aiAssistantView'
import { ContributionsTreeProvider, WorkflowTreeProvider } from './views/workflowTree'
import { FocusForkState, SelectedIssue } from './state'

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  // Store legacy global credentials securely before removing their plaintext copies.
  const legacyConfig = vscode.workspace.getConfiguration('focusfork')
  for (const key of ['accessToken', 'githubToken']) {
    const legacyToken = legacyConfig.inspect<string>(key)?.globalValue?.trim()
    if (legacyToken) {
      if (!(await context.secrets.get(key))) {
        await context.secrets.store(key, legacyToken)
      }
      await legacyConfig.update(key, undefined, vscode.ConfigurationTarget.Global)
    }
  }
  const apiClient = new FocusForkApiClient(context)
  const githubClient = new GitHubClient(context)
  const state = new FocusForkState(context)
  const workflowProvider = new WorkflowTreeProvider(apiClient)
  const contributionsProvider = new ContributionsTreeProvider(apiClient)
  const aiOutput = vscode.window.createOutputChannel('FocusFork AI')
  const savedIssue = state.getSelectedIssue()
  workflowProvider.setStepDone('login')
  workflowProvider.setStepDone('discover')
  workflowProvider.setSelectedIssue(savedIssue)

  const selectIssue = async (issue: SelectedIssue) => {
    await state.setSelectedIssue(issue)
    workflowProvider.setSelectedIssue(issue)

    try {
      const upsert = await apiClient.post('/v1/sessions', {
        repo_owner: issue.repository.owner.login,
        repo_name: issue.repository.name,
        issue_number: issue.number,
        status: 'active',
        metadata: { source: 'code-oss-extension' }
      })
      const sessionId = String((upsert?.id as string) || '')
      await state.setSessionId(sessionId || null)
      if (sessionId) {
        await apiClient.post(`/v1/sessions/${sessionId}/events`, {
          event_type: 'issue.selected',
          payload: {
            issue_number: issue.number,
            title: issue.title,
            repo: issue.repository.full_name
          }
        })
      }
    } catch (error) {
      vscode.window.showWarningMessage(
        `Issue selected locally, but backend sync failed: ${error instanceof Error ? error.message : 'unknown'}`
      )
    }
    workflowProvider.refresh()
  }

  const postSessionEvent = async (eventType: string, payload: Record<string, unknown>) => {
    const sessionId = state.getSessionId()
    if (!sessionId) return
    try {
      await apiClient.post(`/v1/sessions/${sessionId}/events`, { event_type: eventType, payload })
    } catch {
      // non-blocking
    }
  }

  const postContribution = async (eventType: string, metadata: Record<string, unknown>, prNumber?: number) => {
    const issue = state.getSelectedIssue()
    if (!issue) return
    try {
      await apiClient.post('/v1/contributions', {
        session_id: state.getSessionId() || undefined,
        repo_owner: issue.repository.owner.login,
        repo_name: issue.repository.name,
        issue_number: issue.number,
        pr_number: prNumber,
        event_type: eventType,
        metadata
      })
    } catch {
      // non-blocking
    }
  }

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      DiscoverIssuesViewProvider.viewType,
      new DiscoverIssuesViewProvider(context, apiClient, selectIssue)
    ),
    vscode.window.registerWebviewViewProvider(
      AIAssistantViewProvider.viewType,
      new AIAssistantViewProvider(context, apiClient)
    ),
    vscode.window.registerTreeDataProvider('focusfork.workflow', workflowProvider),
    vscode.window.registerTreeDataProvider('focusfork.contributions', contributionsProvider),
    aiOutput
  )

  await Promise.all([workflowProvider.load(), contributionsProvider.load()])
  workflowProvider.refresh()
  contributionsProvider.refresh()

  context.subscriptions.push(
    vscode.commands.registerCommand('focusfork.refreshSession', async () => {
      try {
        const me = await apiClient.get('/v1/me')
        workflowProvider.setStepDone('login')
        await postSessionEvent('auth.refreshed', {})
        vscode.window.showInformationMessage(`FocusFork session ready for ${String(me?.display_name || me?.email || 'user')}`)
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to refresh FocusFork session')
      }
    }),
    vscode.commands.registerCommand('focusfork.openDiscoverIssues', async () => {
      await vscode.commands.executeCommand('focusfork.discoverIssues.focus')
    }),
    vscode.commands.registerCommand('focusfork.openAI', async () => {
      await vscode.commands.executeCommand('focusfork.aiAssistant.focus')
    }),
    vscode.commands.registerCommand('focusfork.refreshWorkflow', async () => {
      workflowProvider.refresh()
      contributionsProvider.refresh()
    }),
    vscode.commands.registerCommand('focusfork.setupAuth', async () => {
      const cfg = vscode.workspace.getConfiguration('focusfork')
      const backendUrl = await vscode.window.showInputBox({
        title: 'FocusFork Backend URL',
        prompt: 'Enter backend URL',
        value: String(cfg.get('backendUrl') ?? 'http://localhost:8080')
      })
      if (!backendUrl) return
      const accessToken = await vscode.window.showInputBox({
        title: 'FocusFork Access Token',
        prompt: 'Paste backend JWT access token',
        password: true
      })
      if (!accessToken) return
      const githubToken = await vscode.window.showInputBox({
        title: 'GitHub Token',
        prompt: 'Paste GitHub token (repo scope)',
        password: true
      })
      if (!githubToken) return

      await cfg.update('backendUrl', backendUrl.trim(), vscode.ConfigurationTarget.Global)
      await context.secrets.store('accessToken', accessToken.trim())
      await context.secrets.store('githubToken', githubToken.trim())
      vscode.window.showInformationMessage('FocusFork auth configuration saved.')
      workflowProvider.refresh()
      contributionsProvider.refresh()
    }),
    vscode.commands.registerCommand('focusfork.quickChat', async () => {
      const prompt = await vscode.window.showInputBox({
        title: 'FocusFork AI',
        prompt: 'Ask for issue-focused code guidance',
        placeHolder: 'Generate minimal fix plan for issue #...'
      })
      if (!prompt || !prompt.trim()) return

      const model = String(vscode.workspace.getConfiguration('focusfork').get('defaultModel') ?? 'openai/gpt-4o-mini')
      const selectedIssue = state.getSelectedIssue()
      const activeFile = vscode.window.activeTextEditor?.document?.uri?.fsPath
      const contextText = selectedIssue
        ? `Issue #${selectedIssue.number}: ${selectedIssue.title}\nRepo: ${selectedIssue.repository.full_name}\nActive file: ${activeFile || 'N/A'}`
        : `No issue selected.\nActive file: ${activeFile || 'N/A'}`
      aiOutput.show(true)
      aiOutput.appendLine(`> ${prompt}`)
      try {
        const response = await apiClient.post('/v1/ai/chat', {
          messages: [{ role: 'user', content: prompt }],
          context: contextText,
          model
        })
        const text = String((response?.message as string) || (response?.text as string) || '')
        workflowProvider.setStepDone('edit')
        await postSessionEvent('ai.prompt.completed', { prompt_length: prompt.length })
        aiOutput.appendLine(text || '(empty response)')
      } catch (error) {
        aiOutput.appendLine(`Error: ${error instanceof Error ? error.message : 'AI request failed'}`)
      }
      aiOutput.appendLine('---')
    }),
    vscode.commands.registerCommand('focusfork.forkRepository', async () => {
      const issue = state.getSelectedIssue()
      if (!issue) {
        vscode.window.showErrorMessage('Select an issue first from Discover Issues.')
        return
      }
      try {
        const fork = await githubClient.fork(issue.repository.owner.login, issue.repository.name)
        workflowProvider.setStepDone('fork')
        await postSessionEvent('repo.forked', { fork: fork.full_name })
        await postContribution('fork.created', { fork: fork.full_name })
        contributionsProvider.refresh()
        workflowProvider.refresh()
        vscode.window.showInformationMessage(`Fork created: ${fork.full_name}`)
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to fork repository')
      }
    }),
    vscode.commands.registerCommand('focusfork.cloneRepository', async () => {
      const issue = state.getSelectedIssue()
      if (!issue) {
        vscode.window.showErrorMessage('Select an issue first from Discover Issues.')
        return
      }
      try {
        const login = await githubClient.getViewerLogin()
        const cloneUrl = `https://github.com/${login}/${issue.repository.name}.git`
        await vscode.commands.executeCommand('git.clone', cloneUrl)
        workflowProvider.setStepDone('clone')
        await postSessionEvent('repo.cloned', { clone_url: cloneUrl })
        await postContribution('repo.cloned', { clone_url: cloneUrl })
        contributionsProvider.refresh()
        workflowProvider.refresh()
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to clone repository')
      }
    }),
    vscode.commands.registerCommand('focusfork.runTests', async () => {
      try {
        const cwd = await getWorkspacePath()
        const command = await detectTestCommand(cwd)
        const output = await runCommand(cwd, command.bin, command.args)
        workflowProvider.setStepDone('test')
        await postSessionEvent('tests.completed', { command: `${command.bin} ${command.args.join(' ')}` })
        await postContribution('tests.completed', { command: `${command.bin} ${command.args.join(' ')}` })
        contributionsProvider.refresh()
        workflowProvider.refresh()
        const out = vscode.window.createOutputChannel('FocusFork Tests')
        out.show(true)
        out.appendLine(output || 'Tests completed.')
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to run tests')
      }
    }),
    vscode.commands.registerCommand('focusfork.commitAndPush', async () => {
      const issue = state.getSelectedIssue()
      if (!issue) {
        vscode.window.showErrorMessage('Select an issue first from Discover Issues.')
        return
      }
      const message = await vscode.window.showInputBox({
        title: 'Commit Message',
        prompt: 'Use a concise, issue-linked commit message',
        value: `fix: address issue #${issue.number}`
      })
      if (!message || !message.trim()) return
      try {
        const cwd = await getWorkspacePath()
        const result = await commitAndPush(cwd, message.trim())
        workflowProvider.setStepDone('push')
        await postSessionEvent('git.push.completed', { branch: result.branch, message: message.trim() })
        await postContribution('commit.pushed', { branch: result.branch, message: message.trim() })
        contributionsProvider.refresh()
        workflowProvider.refresh()
        vscode.window.showInformationMessage(`Pushed branch ${result.branch}`)
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to commit/push')
      }
    }),
    vscode.commands.registerCommand('focusfork.createPullRequest', async () => {
      const issue = state.getSelectedIssue()
      if (!issue) {
        vscode.window.showErrorMessage('Select an issue first from Discover Issues.')
        return
      }
      try {
        const cwd = await getWorkspacePath()
        const branch = await runCommand(cwd, 'git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        const repo = await githubClient.getRepo(issue.repository.owner.login, issue.repository.name)
        const login = await githubClient.getViewerLogin()
        const pr = await githubClient.createPullRequest({
          owner: issue.repository.owner.login,
          repo: issue.repository.name,
          title: `Fix #${issue.number}: ${issue.title}`,
          body: `Closes #${issue.number}\n\nImplemented via FocusFork workflow.`,
          head: `${login}:${branch.trim()}`,
          base: repo.default_branch || 'main'
        })
        workflowProvider.setStepDone('pr')
        await postSessionEvent('pr.created', { pr_number: pr.number, pr_url: pr.html_url })
        await postContribution('pr.created', { pr_url: pr.html_url }, pr.number)
        const poll = setInterval(async () => {
          try {
            const status = await githubClient.getPullRequest(issue.repository.owner.login, issue.repository.name, pr.number)
            await postContribution('pr.status', { state: status.state, merged_at: status.merged_at, pr_url: status.html_url }, pr.number)
            contributionsProvider.refresh()
            if (status.state !== 'open' || status.merged_at) {
              clearInterval(poll)
            }
          } catch {
            clearInterval(poll)
          }
        }, 15000)
        setTimeout(() => clearInterval(poll), 5 * 60 * 1000)
        contributionsProvider.refresh()
        workflowProvider.refresh()
        await vscode.env.openExternal(vscode.Uri.parse(pr.html_url))
      } catch (error) {
        vscode.window.showErrorMessage(error instanceof Error ? error.message : 'Failed to create PR')
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(async () => {
      workflowProvider.setStepDone('clone')
      await postSessionEvent('workspace.changed', {})
      workflowProvider.refresh()
    })
  )

  const refreshTimer = setInterval(() => {
    workflowProvider.refresh()
    contributionsProvider.refresh()
  }, 20000)
  context.subscriptions.push(new vscode.Disposable(() => clearInterval(refreshTimer)))
}

export function deactivate(): void {}
