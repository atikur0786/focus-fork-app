# Releasing FocusFork

Cutting a release is three commands. CI builds macOS, Windows, and Linux,
publishes the GitHub release, and the website updates itself.

## 1. Set the version

The version must **exactly match the tag** (without the leading `v`) in two
files, or the in-app updater will show a phantom "update available" prompt.

Edit both:

- `package.json` → `"version"`
- `resources/release-manifest.json` → `"version"`

```bash
# example: releasing v0.1.0-beta.5
NEW=0.1.0-beta.5
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW\"/" package.json
sed -i '' "s/\"version\": \"[^\"]*\"/\"version\": \"$NEW\"/" resources/release-manifest.json
grep -h '"version"' package.json resources/release-manifest.json
```

## 2. Verify before shipping

```bash
npx tsc --noEmit          # types
npm run test:unit         # unit tests
npm run build             # main + preload + renderer
```

For anything touching the macOS bundle, packaging, or entitlements, also
build and actually launch it — a build that produces artifacts can still
fail to start:

```bash
npm run build:mac -- --publish never
open "$(pwd)/dist/mac-arm64/FocusFork.app"
```

## 3. Ship

```bash
NEW=0.1.0-beta.5
git add package.json resources/release-manifest.json
git commit -m "chore(release): v$NEW"
git push origin master
git tag "v$NEW"
git push origin "v$NEW"
```

The tag push triggers `.github/workflows/build-and-release.yml`.
Watch it: <https://github.com/atikur0786/focus-fork-app/actions>

## 4. Confirm

```bash
# workflow result
curl -s "https://api.github.com/repos/atikur0786/focus-fork-app/actions/runs?per_page=1" \
  | grep -E '"status"|"conclusion"'

# published assets
curl -s "https://api.github.com/repos/atikur0786/focus-fork-app/releases/tags/v0.1.0-beta.5" \
  | grep -o '"name": "[^"]*\.\(dmg\|exe\|zip\|deb\|AppImage\)"'
```

The website needs **no change**: <https://focusfork.dev/download> reads the
newest release from the GitHub API (revalidated every 10 minutes), and the
release workflow pings a Vercel deploy hook so it refreshes immediately.

---

## Fixing a mistake

Re-point a tag that was pushed too early:

```bash
git push origin :refs/tags/v0.1.0-beta.5   # delete remote tag
git tag -f v0.1.0-beta.5                   # move to current HEAD
git push origin v0.1.0-beta.5              # re-trigger the build
```

## Required repository secrets

| Secret | Purpose | Missing behaviour |
| --- | --- | --- |
| `OAUTH_CLIENT_ID` | GitHub OAuth client ID baked into builds | App builds, login fails |
| `VERCEL_DEPLOY_HOOK` | Refreshes the site after publishing | Site updates within 10 min instead |

Secret names cannot start with `GITHUB_` — that prefix is reserved by Actions.

## CI constraints (do not change without testing)

- **Node 22** — `@electron/rebuild` needs ≥22.12 to compile `node-pty`.
- **`--publish never`** on every electron-builder call — on a tagged commit it
  otherwise tries to publish itself and fails on a missing `GH_TOKEN`.
- **`windows-2022`** pinned — the `windows-2025` image breaks node-gyp's
  Visual Studio detection.
- **`if: always()`** on the release job — publishes whatever platforms
  succeeded rather than losing them all to one failing leg.

## Versioning

Pre-1.0 while unstable. Pre-release tags contain a hyphen
(`v0.1.0-beta.5`), which the workflow uses to mark the GitHub release as a
pre-release automatically. `1.0.0` is reserved for the first stable release.

## Known gaps

- Builds are **ad-hoc signed, not notarized**. macOS users must go through
  System Settings → Privacy & Security → Open Anyway. Removing this needs an
  Apple Developer Program membership ($99/yr) plus notarization in CI.
- The `disable-library-validation` entitlement in
  `build/entitlements.mac.plist` is **required** while ad-hoc signed —
  without it the app crashes at launch on every Mac. It can be removed once
  builds are properly signed.
