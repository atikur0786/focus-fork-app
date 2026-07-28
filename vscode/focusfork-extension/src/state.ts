import * as vscode from 'vscode'

export type SelectedIssue = {
  id: number
  number: number
  title: string
  body?: string
  repository: {
    full_name: string
    owner: { login: string }
    name: string
  }
}

const STATE_KEY = 'focusfork.selectedIssue'
const SESSION_KEY = 'focusfork.currentSessionId'

export class FocusForkState {
  constructor(private readonly context: vscode.ExtensionContext) {}

  getSelectedIssue(): SelectedIssue | null {
    return (this.context.globalState.get<SelectedIssue>(STATE_KEY) ?? null)
  }

  async setSelectedIssue(issue: SelectedIssue | null): Promise<void> {
    await this.context.globalState.update(STATE_KEY, issue)
  }

  getSessionId(): string | null {
    return this.context.globalState.get<string>(SESSION_KEY) ?? null
  }

  async setSessionId(sessionId: string | null): Promise<void> {
    await this.context.globalState.update(SESSION_KEY, sessionId)
  }
}
