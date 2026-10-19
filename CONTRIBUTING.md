# Contributing to FocusFork 🍴

Thank you for helping improve FocusFork! We are building a local desktop workspace for the open-source contribution workflow, using Electron, React, TypeScript, and `electron-vite`.

## 🛠️ Development Setup

### Prerequisites

- **Node.js 22.12 or newer in the Node 22 release line**, matching the current CI setup and native dependency requirements.
- **npm**, used by the checked-in `package-lock.json` and CI.
- **Git**, installed and available on your `PATH`.
- A GitHub account and an OAuth app with device flow enabled for testing GitHub sign-in.
- A provider API key for testing BYOK AI features. Keep it out of source control and test fixtures.

Native dependencies such as `node-pty` may need your platform's C/C++ build tools if prebuilt binaries are unavailable.

### 1. Clone the Repository

For a pull request, fork the repository on GitHub and clone your fork instead of the upstream URL below.

```bash
git clone https://github.com/atikur0786/focus-fork-app.git
cd focus-fork-app
```

### 2. Install Dependencies

```bash
npm ci
```

The install hook prepares Electron's native dependencies. When intentionally changing dependencies, use `npm install` and include the updated lockfile.

### 3. Configure GitHub Sign-in

Create a `.env` file in the repository root:

```dotenv
GITHUB_CLIENT_ID=your_github_oauth_client_id
```

The desktop uses GitHub's device-code flow. Enable device flow on your OAuth app; no client secret or callback URL is required for this desktop login path. Packaged builds resolve the client ID from `resources/app-config.json` instead.

For AI development, launch the app and configure a provider, model, and BYOK key in **Settings → AI Agent**. BYOK requests do not require the managed AI backend. Backend-connected authentication, synchronization, and subscription features require a separately configured service; see [docs/ENV_CONTRACT.md](docs/ENV_CONTRACT.md) for the current environment contract.

Do not commit `.env` files containing credentials, private keys, tokens, or real user data. Never embed an AI provider key in the renderer or packaged app configuration.

### 4. Run the Development Server

```bash
npm run dev
```

This runs the Electron dependency diagnostic and starts `electron-vite` development mode with renderer hot reload. The app opens as an Electron window.

`npm run dev:renderer` starts a renderer-only development server; it does not provide the native Electron main process or its IPC behavior.

## 🏗️ Architectural Guidelines

- **Main process (`src/main/`):** Keep native operations here: `safeStorage` credential handling, filesystem access, GitHub/provider requests, and `simple-git` execution. Service implementations live in `src/main/services/`; IPC handlers are registered in `src/main/index.ts`. Validate renderer-supplied paths and arguments before using native APIs.
- **Preload bridge (`src/preload/`):** Keep `contextIsolation: true`. Expose explicit, typed operations through `contextBridge` in `src/preload/index.ts`, rather than exposing unrestricted `ipcRenderer`, shell execution, or filesystem access. Update the corresponding declarations in `src/preload/index.d.ts` when changing the API.
- **Renderer (`src/renderer/src/`):** Build modular React components and coordinate workflow state through Zustand store actions. Agent modules live in `src/renderer/src/agents/`. Use the preload API for native operations; keep credentials out of renderer state and logs.
- **Shared contracts (`src/shared/`):** Keep request boundaries and shared validation consistent across processes. Preserve structured errors and the selected model when changing AI calls. BYOK calls use the selected provider directly; subscription calls use the backend path.
- **Approvals and Git safety:** Preserve the existing approval gates for repository changes, commits, pushes, and pull requests. Keep push destination verification in the main-process Git execution layer. Deterministic validation and AI review are separate responsibilities.
- **UI changes:** Add stable `data-testid` attributes to interactive elements and check loading, failure, and recovery states. Use the existing CodeMirror editor and VS Code bridge patterns.

Workflow agents share context within the application; they are not independent security sandboxes. Treat all data crossing the renderer/main boundary as untrusted input.

## ✅ Verify Your Changes

Run type checking after each file change and build before committing, as required by [AGENTS.md](AGENTS.md):

```bash
npm run typecheck
npm run build
```

For behavior changes, run the unit suite and add focused coverage where appropriate:

```bash
npm run test:unit
```

Run `npm run lint` for code-style checks. For changes affecting complete Electron workflows, inspect `tests/e2e/` and use `npm run test:e2e` with the required local setup. Use test repositories and credentials for any manual fork, push, or pull-request checks.

To package an installer on the appropriate platform:

```bash
npm run build:mac
npm run build:win
npm run build:linux
```

These commands do not replace the explicit typecheck/build checks above. Signing and notarization require the corresponding release credentials.

## 📝 Commit and Pull Request Standards

Follow Conventional Commits, for example `feat(desktop):`, `fix(desktop):`, `docs(desktop):`, or `test(desktop):`. Keep each commit focused on one task.

Open a pull request against this repository with a clear description of the problem, resulting behavior, and checks performed. Include screenshots for UI changes and call out IPC or backend contract changes so reviewers can assess compatibility.

By submitting a contribution, you agree that it is provided under this repository's [Apache 2.0 license](LICENSE).
