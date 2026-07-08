# PRD: Fix Title About Screen — Commit Info Shows N/A

| Field | Value |
|-------|-------|
| Issue | #75 |
| Priority | Low |
| Labels | bug, workflow/research |
| Author | Subagent |

## 1. Problem / Root Cause

### Current Behavior

When navigating to the ABOUT screen from the title menu, all commit metadata fields display as `N/A`:

```
Commit: N/A
Msg:    N/A
Date:   N/A
```

The expected behavior is to show the actual commit hash (7-char abbreviated SHA), commit message, and commit timestamp for the deployed build.

### Root Cause (Two-Part)

The issue spans two layers:

**① Deployment pipeline — missing build step**

The file `public/gameboy.html` defines a global `window.__COMMIT_INFO` block with placeholder tokens:

```html
<script>
  window.__COMMIT_INFO = {
    hash: "__COMMIT_HASH__",
    message: "__COMMIT_MSG__",
    date: "__COMMIT_DATE__"
  };
</script>
```

These `__xxx__` tokens are intended to be replaced by a build step at deploy time with actual git metadata. However:

- `vercel.json` has `"buildCommand": null` — no build command is configured
- The deploy workflow (`deploy.yml`) uses `amondnet/vercel-action` with static file serving only
- No build-time substitution script exists to perform the replacement

As a result, the raw placeholder strings survive into the deployed HTML.

**② Runtime guard — correct rejection of unreplaced tokens**

The JavaScript in `createInitialState()` (`public/src/engine/core.js`) correctly guards against unreplaced placeholders:

```js
const commitInfo = (typeof window !== 'undefined' && window.__COMMIT_INFO &&
    window.__COMMIT_INFO.hash &&
    !window.__COMMIT_INFO.hash.startsWith('__'))
    ? window.__COMMIT_INFO
    : { hash: 'N/A', message: 'N/A', date: 'N/A' };
```

The check `!window.__COMMIT_INFO.hash.startsWith('__')` evaluates to `false` because `__COMMIT_HASH__` starts with `__`, so the fallback `N/A` values are used. This guard is **correct** — it prevents displaying placeholder strings. The gap is that the placeholders are never replaced.

### Expected Behavior

Per issue #66 (original title menu feature), the ABOUT screen should display real commit metadata:

| Field | Expected |
|-------|----------|
| Commit | Abbreviated SHA (e.g., `a637e10`) |
| Msg | Commit message (truncated to ~55 chars) |
| Date | Commit timestamp (e.g., `2026-07-09 00:09`) |

---

## 2. Impact

| Area | Impact |
|------|--------|
| **Deployment Pipeline** (`vercel.json`, `deploy.yml`) | Must add a build script that reads git commit info and injects it into `gameboy.html` before deployment |
| **`public/gameboy.html`** | The `__COMMIT_INFO` block remains as-is; the replacement happens externally during build |
| **Public/User Experience** | Low severity — cosmetic bug on the ABOUT screen only. Does not affect gameplay. |
| **Local Development** | No impact. Running locally (file:// or local dev server) has no build step, so `N/A` is the expected and correct fallback. |
| **Test Suite** | Existing tests in `metroidvania-snake.test.js` already test the `N/A` fallback behavior for non-deployment environments. No changes needed. |

### Data Flow (After Fix)

```
git push → GitHub Actions (deploy.yml)
  → Checkout code (full git history)
  → Build script: read git log, replace __COMMIT_HASH__/__MSG__/__DATE__ in gameboy.html
  → Vercel deploy: serves the modified HTML with real commit info
  → User opens game → ABOUT screen → window.__COMMIT_INFO has real values
  → createInitialState() → passes guard (!startsWith('__')) → uses real values
  → renderAboutScreen() → displays commit hash, message, date
```

---

## 3. Alternatives

### Alternative A: Build-time Sed Script in Deploy Workflow (Recommended)

**Description:** Add a simple shell script (`scripts/inject-commit-info.sh`) that uses `git log -1` to read the current commit metadata and performs `sed` replacements on `gameboy.html` before Vercel deployment. Configure `vercel.json` with `"buildCommand": "bash scripts/inject-commit-info.sh"` to run it automatically.

**Implementation sketch:**
```bash
#!/bin/bash
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")

sed -i "s/__COMMIT_HASH__/$HASH/g" public/gameboy.html
sed -i "s/__COMMIT_MSG__/$MSG/g"   public/gameboy.html
sed -i "s/__COMMIT_DATE__/$DATE/g" public/gameboy.html
```

**Pros:**
- Simple, zero dependencies — pure bash + sed
- Works with any CI/provider (GitHub Actions, Vercel, Netlify)
- Only ~10 lines of code
- Easy to test locally
- Can handle special characters in commit messages (escaping)
- No npm packages needed

**Cons:**
- Sed can break on commit messages with `/`, `&`, or special sed characters
- Modifies the file in-place (build artifact pollution if run locally without cleanup)
- Date format must be decided (ISO 8601 is git default: `%ai`)

**Effort:** Small (~0.5–1 hour)

### Alternative B: Node.js Build Script with JSON Reading

**Description:** Write a Node.js script that writes commit info to a separate JSON file (e.g., `public/.commit-info.json`) during build. Modify `gameboy.html` to load this JSON file at runtime, or inline it as a `<script>` tag.

**Implementation sketch:**
```js
// scripts/write-commit-info.js
import { execSync } from 'child_process';
import { writeFileSync } from 'fs';

const hash = execSync('git log -1 --format="%h"').toString().trim();
const msg  = execSync('git log -1 --format="%s"').toString().trim();
const date = execSync('git log -1 --format="%ai"').toString().trim();

const htmlPath = 'public/gameboy.html';
let html = readFileSync(htmlPath, 'utf8');
html = html.replace('"__COMMIT_HASH__"', `"${hash}"`);
html = html.replace('"__COMMIT_MSG__"',  `"${msg}"`);
html = html.replace('"__COMMIT_DATE__"', `"${date}"`);
writeFileSync(htmlPath, html);
```

**Pros:**
- JSON escaping handles special characters safely
- More robust than sed for complex commit messages
- Leverages existing Node.js runtime in the deployment environment
- Can be extended to include additional metadata later

**Cons:**
- Requires Node.js (already available in the deploy workflow, but adds execution overhead)
- More code than the bash alternative

**Effort:** Small (~0.5–1 hour)

### Alternative C: Vercel Serverless Function (API Endpoint for Commit Info)

**Description:** Create a Vercel serverless function at `api/commit-info.js` that reads the commit metadata from a build-time-generated JSON file stored as a static asset. The client-side JS fetches the info at runtime via a fetch call.

**Implementation sketch:**
```js
// api/commit-info.js
export default function handler(req, res) {
  res.status(200).json({
    hash: process.env.COMMIT_HASH || '__COMMIT_HASH__',
    message: process.env.COMMIT_MSG || '__COMMIT_MSG__',
    date: process.env.COMMIT_DATE || '__COMMIT_DATE__',
  });
}
```

**Pros:**
- Clean separation of concerns — HTML stays pristine
- No file modification needed
- Can be cached and revalidated

**Cons:**
- Adds a network request to the client on every ABOUT screen open
- Over-engineered for a simple metadata display
- Requires Vercel Functions (may add cold-start latency)
- Changes data flow from synchronous (in-memory) to asynchronous
- Increases deployment complexity

**Effort:** Medium (~1–2 hours)

---

## 4. Boundary Conditions

| # | Condition | Expected Behavior |
|---|-----------|-------------------|
| 1 | **Local file:// access** | `window.__COMMIT_INFO` stays as placeholder `__xxx__`; guard in `createInitialState()` catches it → displays `N/A` correctly |
| 2 | **No git repo / no `git` binary** | Build script must detect failure (`git log -1` returns non-zero exit code) and fall back to `unknown` or leave placeholders intact so the runtime guard shows `N/A` |
| 3 | **Shallow clone (CI environments)** | Git history contains only the most recent commit, so `git log -1` works correctly even on shallow clones |
| 4 | **Commit message with special characters (quotes, slashes, backslashes)** | Build script must properly escape characters in sed replacement (or use Node.js with JSON serialization for safe escaping) |
| 5 | **Vercel Preview Deployments (non-master branches)** | Preview deploys from PR branches should show the head commit of that branch (the deploy workflow checks out the PR code, so `git log -1` naturally shows the correct commit) |
| 6 | **Empty repository (no commits)** | `git log -1` fails → build script falls back → placeholders remain → runtime guard shows `N/A` |

---

## 5. Proposed Solution (Recommended: Alternative A)

### Build Script

Create `scripts/inject-commit-info.sh`:

```bash
#!/bin/bash
# Inject real git commit metadata into gameboy.html before deployment

set -e

HTML_FILE="public/gameboy.html"

# Read commit metadata from git
HASH=$(git log -1 --format="%h" 2>/dev/null || echo "unknown")
MSG=$(git log -1 --format="%s" 2>/dev/null || echo "unknown")
DATE=$(git log -1 --format="%ai" 2>/dev/null || echo "unknown")

# Use Node.js for safe JSON escaping of commit message
if command -v node &> /dev/null; then
  ESCAPED_MSG=$(node -e "console.log(JSON.stringify(process.argv[1]).slice(1,-1))" "$MSG")
else
  ESCAPED_MSG="$MSG"
fi

# Replace placeholders in-place
sed -i "s/__COMMIT_HASH__/$HASH/g" "$HTML_FILE"
sed -i "s/__COMMIT_MSG__/$ESCAPED_MSG/g" "$HTML_FILE"
sed -i "s/__COMMIT_DATE__/$DATE/g" "$HTML_FILE"

echo "Injected commit info: $HASH — $ESCAPED_MSG"
```

### Pipeline Changes

- `vercel.json`: Set `"buildCommand": "bash scripts/inject-commit-info.sh"` (Vercel will run this before serving static files)
- Or alternatively, add the script call to the deploy workflow in `deploy.yml` before the Vercel action step

### Who to Assign

Anyone familiar with shell scripting and CI pipelines.
