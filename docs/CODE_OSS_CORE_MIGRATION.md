# Code OSS Core Migration Plan

This branch migrates FocusFork from a Monaco-based custom IDE shell to a Code OSS core with a FocusFork extension layer and backend-controlled workflow.

## Target Architecture

1. Code OSS workbench is the in-app editor core.
2. FocusFork features are delivered as a VS Code extension:
   - GitHub auth/session bootstrap
   - Discover Issues
   - Issue detail + checklist
   - AI assistant panel
   - PR helper commands
3. FocusFork backend is the source of truth for:
   - user/session identity
   - contribution events
   - AI model catalog and quota
   - billing/plan usage

## Migration Phases

1. Foundation:
   - Add FocusFork extension scaffold.
   - Define backend API client contract used by extension.
2. Discover + Workflow:
   - Implement issue discovery view container.
   - Add workflow checklist tree view synced to backend session.
3. AI integration:
   - Add AI chat webview driven by `/v1/ai/chat`.
   - Add typed error handling in extension UI.
4. PR integration:
   - Implement fork/clone/branch helpers via VS Code git APIs + backend events.
5. Packaging:
   - Ship branded Code OSS product build with preinstalled FocusFork extension.

## Non-goals in this step

- Full embedded Code OSS packaging in this commit.
- Removal of current Electron shell workflows before extension parity is reached.
