# FocusFork Release Rescue Plan

## Goal
Ship a usable MVP that lets one developer reliably complete this loop:

1. Sign in with GitHub
2. Discover an issue
3. Evaluate issue fit
4. Fork and clone the repo
5. Open the repo in the user’s preferred IDE
6. Get AI guidance tied to the selected issue and repo
7. Commit, push, and create a PR
8. Track the contribution inside FocusFork

This plan intentionally does **not** promise a fully embedded Cursor-style editor in v1.
The desktop app is the workflow control plane. The user edits in VS Code/Cursor/Windsurf.

## Product Positioning for MVP
FocusFork v1 should be described as:

> A guided open-source contribution companion that helps developers go from issue discovery to shipped PR with AI assistance and human approval.

This is the honest, sellable version of the current architecture.

## What Is In Scope for Release
- GitHub sign-in that survives app restarts
- Issue discovery with working filters, loading states, and error states
- Approval-gated fork and clone
- External IDE launch for the selected repo
- AI guidance tied to issue + repo context
- Commit, push, and create PR flow
- Contribution history timeline that reflects meaningful user actions
- Landing page and download messaging aligned to what actually works

## What Is Explicitly Deferred
- Embedded full IDE / Monaco replacement beyond companion-mode workspace
- Cursor-grade inline completion / code edits inside Electron
- Autonomous repo-wide code modification without approval
- Multi-platform provider integrations beyond GitHub for contributions

## Release Blockers (P0)
1. Auth/session ambiguity between desktop GitHub auth and backend session sync
2. Incomplete `data-testid` coverage for core workflow screens
3. Weak golden-path E2E coverage
4. Contribution history not guaranteed to capture every meaningful workflow event
5. AI panel is still chat-first instead of action-first

## Execution Order
### Task A — Auth + Test Contract Foundation
- Complete missing `data-testid` coverage for login/discover/history shell
- Keep login resilient when backend sync lags
- Ensure post-login state is visible and testable

### Task B — Workflow Evidence / Profile Builder
- Persist richer contribution events for branch, commit, push, PR
- Make contribution history readable as a GitHub profile builder timeline
- Ensure backend receives those events consistently

### Task C — AI Guidance UX Upgrade
- Shift AI panel output toward structured action blocks
- Always surface likely files, commands, risks, next step
- Make approval and next-action loop feel intentional rather than generic chat

### Task D — Real Golden Path QA Gate
- Expand Playwright beyond shell smoke checks
- Add a realistic golden-path flow contract for the desktop shell
- Pair with manual QA on a clean machine

### Task E — Landing + Release Alignment
- Make landing claims match the real MVP
- Verify download/version sync before public release

## Release Gate
Do not publicly launch until all are true:
- Desktop: `npm run typecheck` passes
- Desktop: `npm run build` passes
- Desktop: manual golden path works on a clean machine
- Backend: `go build ./...` and `go test ./...` pass
- Landing: `npm run build` passes
- One real issue-to-PR flow completes without recovery steps

## Success Definition
The product is release-ready when you can personally use FocusFork to make a real open-source contribution from issue discovery to PR without needing to bypass the app’s intended workflow.
