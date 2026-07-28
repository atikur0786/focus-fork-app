import * as vscode from 'vscode'
import { SelectedIssue } from '../state'
import { FocusForkApiClient } from '../apiClient'

export class DiscoverIssuesViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'focusfork.discoverIssues'

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiClient: FocusForkApiClient,
    private readonly onIssueSelected: (issue: SelectedIssue) => Promise<void>
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webview = webviewView.webview
    webview.options = { enableScripts: true }
    webview.html = this.getHtml('Discover Issues', 'Query issues from FocusFork backend.')

    webview.onDidReceiveMessage(async (message: any) => {
      if (message?.type !== 'search') return
      const query = typeof message.query === 'string' ? message.query.trim() : ''
      try {
        const data = await this.apiClient.get(`/v1/github/issues?q=${encodeURIComponent(query)}`)
        const rawItems = Array.isArray(data?.items) ? (data.items as any[]) : []
        const items = rawItems.map((item: any) => ({
          id: Number(item?.id || 0),
          number: Number(item?.number || 0),
          title: String(item?.title || ''),
          body: String(item?.body || ''),
          html_url: String(item?.html_url || ''),
          repository: {
            full_name: String(item?.repo_full_name || ''),
            owner: { login: String(item?.owner || '') },
            name: String(item?.repo || '')
          }
        }))
        webview.postMessage({ type: 'results', items })
      } catch (error) {
        webview.postMessage({
          type: 'error',
          message: error instanceof Error ? error.message : 'Search failed'
        })
      }
    })

    webview.onDidReceiveMessage(async (message: any) => {
      if (message?.type !== 'selectIssue' || !message.issue) return
      const issue = message.issue as SelectedIssue
      await this.onIssueSelected(issue)
      void vscode.window.showInformationMessage(`Selected issue #${issue.number}: ${issue.title}`)
    })
  }

  private getHtml(title: string, subtitle: string): string {
    return `<!doctype html>
<html>
  <body>
    <h2>${title}</h2>
    <p>${subtitle}</p>
    <input id="q" placeholder="Search issues" />
    <button id="search">Search</button>
    <pre id="out"></pre>
    <script>
      const vscode = acquireVsCodeApi();
      const q = document.getElementById('q');
      const out = document.getElementById('out');
      let latestItems = [];
      document.getElementById('search').addEventListener('click', () => {
        vscode.postMessage({ type: 'search', query: q.value || '' });
      });
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'results') {
          latestItems = Array.isArray(msg.items) ? msg.items : [];
          out.textContent = '';
          if (latestItems.length === 0) {
            out.textContent = 'No issues found';
            return;
          }
          latestItems.forEach((item, idx) => {
            const row = document.createElement('div');
            row.style.margin = '8px 0';
            row.style.padding = '8px';
            row.style.border = '1px solid #333';
            const title = document.createElement('div');
            title.textContent = '#' + item.number + ' ' + item.title;
            title.style.fontWeight = '600';
            const repo = document.createElement('div');
            repo.textContent = item.repository?.full_name || '';
            repo.style.opacity = '0.8';
            const btn = document.createElement('button');
            btn.textContent = 'Select';
            btn.style.marginTop = '6px';
            btn.onclick = () => vscode.postMessage({ type: 'selectIssue', issue: item });
            row.appendChild(title);
            row.appendChild(repo);
            row.appendChild(btn);
            out.appendChild(row);
          });
        }
        if (msg.type === 'error') out.textContent = 'Error: ' + msg.message;
      });
    </script>
  </body>
</html>`
  }
}
