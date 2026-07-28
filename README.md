# FocusFork

**The bridge between you and your first (or fiftieth) open-source contribution.**

FocusFork is a free, open-source desktop app that walks you through the entire open-source contribution flow in one place: discover an issue → star, fork & clone → edit with a built-in editor and AI assistant → review → commit → push → open the pull request.

- **Free forever.** Every core feature works with your own AI provider API key (BYOK) — no account, no sign-up, no FocusFork servers involved.
- **Open source.** Apache 2.0. Read the code, build it yourself, contribute back.
- **Optional subscription.** Don't want to manage API keys? Sign in and use FocusFork's built-in models instead. That's the only paid part, and it's never required.

## ✨ Features

- **Guided OSS workflow**: Discover → Fork → Clone → Branch → Edit → Review → Commit → Push → PR.
- **Issue discovery**: Search and filter open issues across GitHub by language, labels, and repo scope, with an AI "fit check" before you invest an evening.
- **Built-in editor & terminal**: CodeMirror editor with multi-tab support, file explorer, and a real PTY terminal.
- **AI assistant (BYOK or subscription)**: Repo- and issue-aware chat that can propose file edits you approve and apply.
- **Review agent**: Checks your diff for bugs and style issues before you commit.
- **Source control panel**: Branch, stage, commit, push, and create the PR against the upstream repo — all guarded by explicit approval gates.

## 🔑 Two ways to power AI

| | Your own API key (default) | FocusFork subscription |
|---|---|---|
| Cost | Free (you use your provider's free tier or pay them directly) | Paid plan |
| Account needed | No | Yes (GitHub sign-in) |
| Key storage | Encrypted with your OS keychain via Electron `safeStorage` — never plaintext, never sent to FocusFork | No key needed |
| Providers | OpenRouter (free models available), Google Gemini | Managed model catalog |

Switch anytime in **Settings → AI Agent**.

## 🛠 Tech Stack

- **Core**: [Electron](https://www.electronjs.org/), [React](https://react.dev/), [TypeScript](https://www.typescriptlang.org/)
- **Editor**: [CodeMirror 6](https://codemirror.net/) · **Terminal**: xterm.js + node-pty
- **Styling**: [Tailwind CSS](https://tailwindcss.com/) v4 · **State**: [Zustand](https://github.com/pmndrs/zustand)
- **Build**: electron-vite, electron-builder

## 🏁 Getting Started

### Prerequisites

- **Node.js** v20+
- **Git** installed and configured
- **GitHub account** (used for issue search, fork, and PR via GitHub's own device flow — not a FocusFork account)

### Run from source

```bash
git clone https://github.com/ACodeDaily/focus-fork.git
cd focus-fork
npm install
npm run dev
```

Create a `.env` in the repo root with your GitHub OAuth app client ID (device flow — no secret or callback URL needed):

```env
GITHUB_CLIENT_ID=your_github_oauth_client_id
```

For packaged builds, ship `resources/app-config.json` instead:

```json
{ "githubClientId": "your_client_id" }
```

### First run

1. Sign in with GitHub (device flow).
2. Pick a workspace folder (where repos get cloned).
3. In **Settings → AI Agent**, paste your OpenRouter or Gemini API key (or skip AI entirely — everything else still works).
4. Head to **Discover** and find your first issue.

### Building installers

```bash
npm run build:mac   # macOS
npm run build:win   # Windows
npm run build:linux # Linux
```

### Tests

```bash
npm run test:unit
npm run typecheck
```

## 🔒 Privacy

- Your AI API key is stored encrypted using your OS keychain (Electron `safeStorage`) and is only ever sent to the provider you chose.
- Your GitHub token is stored the same way and only talks to GitHub.
- An anonymous daily ping (random install ID, app version, OS — nothing else) helps us count active users. Turn it off in **Settings → Privacy**.

## 🤝 Contributing

Contributions are welcome — and FocusFork itself is the best tool for the job once you have it running. Fork this repo, point FocusFork at one of our issues, and ship a PR.

## 📄 License

[Apache 2.0](LICENSE)
