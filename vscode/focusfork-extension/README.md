# FocusFork VS Code Extension (Code OSS Layer)

This extension is the FocusFork product layer for the Code OSS core.

## Current scope in this scaffold

- Activity bar container: `FocusFork`
- Webview views:
  - `Discover Issues`
  - `AI Assistant`
- Tree views:
  - `Workflow`
  - `Contribution Status`
- Commands:
  - `FocusFork: Setup Auth Tokens`
  - `FocusFork: Refresh Session`
  - `FocusFork: Open Discover Issues`
  - `FocusFork: Open AI Assistant`
  - `FocusFork: Refresh Workflow`
  - `FocusFork: Quick AI Prompt` (`Cmd/Ctrl+L`)
  - `FocusFork: Fork Repository`
  - `FocusFork: Clone Repository`
  - `FocusFork: Run Tests`
  - `FocusFork: Commit and Push`
  - `FocusFork: Create Pull Request`

## Backend settings

Set in VS Code settings:

- `focusfork.backendUrl` (default: `http://localhost:8080`)
- `focusfork.accessToken`
- `focusfork.defaultModel`
- `focusfork.githubToken` (required for fork/PR operations)

## Build

```bash
cd /Users/apple/Atikur/focus-fork-app-gemini/vscode/focusfork-extension
npm install
npm run build
```

## Next implementation steps

1. Move Discover Issues from direct GitHub API to backend issue discovery endpoint.
2. Replace input-box token setup with OAuth-style desktop login handoff.
3. Add richer AI webview UI (streaming, markdown rendering, patch suggestions).
4. Add robust conflict-handling for commit/push/PR commands.
