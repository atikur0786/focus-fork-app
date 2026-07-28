import * as vscode from 'vscode'
import { FocusForkApiClient } from '../apiClient'

export class AIAssistantViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'focusfork.aiAssistant'

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly apiClient: FocusForkApiClient
  ) {}

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    const webview = webviewView.webview
    webview.options = { enableScripts: true }
    webview.html = this.getHtml()

    webview.onDidReceiveMessage(async (message: any) => {
      if (message?.type !== 'chat') return
      const prompt = typeof message.prompt === 'string' ? message.prompt.trim() : ''
      if (!prompt) return

      try {
        const model = String(vscode.workspace.getConfiguration('focusfork').get('defaultModel') ?? 'openai/gpt-4o-mini')
        const response = await this.apiClient.post('/v1/ai/chat', {
          messages: [{ role: 'user', content: prompt }],
          context: '',
          model
        })
        const text = String((response?.message as string) || (response?.text as string) || '')
        webview.postMessage({ type: 'assistant', text })
      } catch (error) {
        webview.postMessage({
          type: 'assistant',
          text: `Error: ${error instanceof Error ? error.message : 'AI request failed'}`
        })
      }
    })
  }

  private getHtml(): string {
    return `<!doctype html>
<html>
  <body>
    <h2>FocusFork AI Assistant</h2>
    <textarea id="prompt" rows="8" style="width: 100%;" placeholder="Ask for issue-focused code guidance"></textarea>
    <button id="send">Send</button>
    <pre id="out"></pre>
    <script>
      const vscode = acquireVsCodeApi();
      const prompt = document.getElementById('prompt');
      const out = document.getElementById('out');
      document.getElementById('send').addEventListener('click', () => {
        vscode.postMessage({ type: 'chat', prompt: prompt.value || '' });
      });
      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type === 'assistant') out.textContent = msg.text || '';
      });
    </script>
  </body>
</html>`
  }
}
