# FocusFork 🍴

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Platform: macOS, Windows, Linux](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows%20%7C%20Linux-blue.svg)](#-download--installation)

**FocusFork** is a local, open-source Electron desktop workspace for GitHub contributions. Discover public issues, fork and clone repositories, work with contextual AI, review changes, and prepare a pull request in one place.

Native Git commands run on your machine through `simple-git`. Bring your own AI provider key (BYOK) to connect issue context and local code to the model you choose.

## ✦ Why FocusFork?

Contributing often means moving between issue pages, repository setup, your editor, Git commands, and a separate AI chat. FocusFork brings those steps into a guided workspace while keeping you in control of changes.

- **Issue discovery:** Query and filter public GitHub issues by language, labels such as `good first issue`, and repository context.
- **Local Git orchestration:** Approve repository forks through the GitHub API, clone with `simple-git`, and set up a working branch. Push checks verify the destination before sending changes.
- **BYOK context:** Connect OpenAI, Anthropic, Google Gemini, or OpenRouter. Workflow-specific prompts package issue details, repository paths, or local diffs; they do not automatically send the entire repository.
- **Local credential protection:** The desktop stores BYOK keys and GitHub tokens in files encrypted with Electron `safeStorage`. BYOK AI requests go directly to the selected provider. See the privacy section for backend-connected features.

## 🛠️ Architecture under the Hood

Electron's main process handles native operations and provider requests. A context-isolated preload bridge exposes explicit IPC functions to the React renderer, where Zustand coordinates workflow state and agent modules:

1. **Discover (deterministic):** Coordinates GitHub issue search and repository operations.
2. **Code Guide (AI-assisted):** Packages issue details and repository paths to help explain a potential contribution.
3. **Reviewer (deterministic):** Validates workflow prerequisites such as authentication, issue context, clone state, and working branch, and reports required approvals. Remote push verification runs separately in the main-process Git service.
4. **Code Review (AI-assisted):** Sends local diff context to the selected AI path for suggested findings. Treat these suggestions as assistance, not a correctness guarantee.
5. **Ship (Git + AI):** Helps draft commit summaries and coordinates approved commit, push, and pull-request operations through the main process.

These modules share workflow context; they are not separate OS processes or security sandboxes. The app also includes a CodeMirror editor, file explorer, and terminal, with a bridge for opening a workspace in VS Code.

## 📥 Download & Installation

FocusFork's source is available under the [Apache 2.0 license](LICENSE). BYOK provider usage may incur charges from your provider.

Get available macOS, Windows, and Linux packages from the [Releases page](https://github.com/atikur0786/focus-fork-app/releases), or build from source using [CONTRIBUTING.md](CONTRIBUTING.md).

### macOS (Beta)

Move FocusFork to `/Applications` before opening it. If a trusted download is blocked by Gatekeeper because of its signing or quarantine status, run:

```bash
xattr -cr /Applications/FocusFork.app
```

This removes extended attributes, including quarantine, from that app bundle. It does not sign or notarize the app.

### Windows & Linux

Choose the package for your operating system from the Releases page. Local repository operations require Git to be installed and available on your `PATH`.

### First run

1. Sign in with GitHub using the device-code flow.
2. Choose a local workspace folder for cloned repositories.
3. Open **Settings → AI Agent**, select a provider and model, and save your BYOK key.
4. Search for an issue in **Discover**, review its context, and approve the repository setup steps.

The code also contains a backend-connected subscription mode. Its availability depends on the configured backend and account entitlements; downloading the desktop does not include a paid AI allowance.

## 🔒 Privacy & Data Policy

- **BYOK requests:** Prompts leave the Electron main process directly for the selected provider. Issue descriptions, file paths, diffs, and any other included prompt content are subject to that provider's data policy. Local Git execution does not mean local model inference.
- **Local secrets:** Desktop BYOK keys (`ai_key`), GitHub tokens (`auth_token`), and backend sessions (`platform_session`) use `safeStorage` encryption in Electron's `userData` directory. These are encrypted files, not individual keychain entries; protection depends on the OS encryption backend. Non-secret preferences are stored separately.
- **Backend-connected features:** Subscription AI sends prompts through the configured FocusFork backend. Backend identity synchronization can send GitHub identity and access-token data, and connected features can synchronize conversation and workflow records. BYOK AI keys are not uploaded by the desktop's provider path.
- **Telemetry controls:** Anonymous activity pings are enabled by default and can be disabled in **Settings → Privacy**. They contain a persistent random installation ID, app version, operating system, and AI mode, and are sent at startup and every 24 hours. The backend aggregates daily installation activity. This toggle controls those pings; it does not disable authenticated synchronization or subscription usage accounting.

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for setup, Main/Preload/Renderer boundaries, verification commands, and commit conventions.

## 📄 License

[Apache 2.0](LICENSE)
