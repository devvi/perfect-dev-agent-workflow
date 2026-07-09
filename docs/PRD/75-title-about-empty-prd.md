# Research: Fix Title About Screen — Commit Info Shows N/A

> Parent Issue: #75
> Agent: research-agent (Subagent)
> Date: 2026-07-09
> Status: Open
> Priority: Low

---

## 1. Problem Definition

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

### User Scenarios

- **Scenario A (deployed build):** 用户部署后打开游戏 → ABOUT 页面显示正确的 commit hash、消息和日期
- **Scenario B (local dev):** 本地运行（无构建步骤）→ ABOUT 页面显示 `N/A`（预期行为）
- **Scenario C (preview deploy):** Vercel PR preview → 显示该分支的 head commit
- **Frequency:** 每次打开 ABOUT 页面

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

#66 设计时预留了 `__COMMIT_INFO` 区块用于构建时注入，但 `vercel.json` 的 `buildCommand: null` 和无构建脚本导致占位符从未被替换。

### Why Change Now?

ABOUT 页面是 Issue #66 的核心功能之一。如果始终显示 `N/A`，菜单系统的"查看版本"功能完全无用。

### Previous Constraints

- 不能改变 `createInitialState()` 中的 guard 逻辑（它正确地防止了占位符泄露）
- 构建脚本必须在 Vercel deploy 之前运行
- 本地开发时应保持 `N/A`（无构建步骤）

---

## 3. Impact Analysis

| Area | Impact |
|------|--------|
| **Deployment Pipeline** (`vercel.json`, `deploy.yml`) | Must add a build script that reads git commit info and injects it into `gameboy.html` before deployment |
| **`public/gameboy.html`** | The `__COMMIT_INFO` block remains as-is; the replacement happens externally during build |
| **Public/User Experience** | Low severity — cosmetic bug on the ABOUT screen only. Does not affect gameplay. |
| **Local Development** | No impact. Running locally has no build step, so `N/A` is the expected and correct fallback. |
| **Test Suite** | Existing tests already test the `N/A` fallback behavior for non-deployment environments. No changes needed. |

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Build Artifact | 占位符将被构建时替换（文件本身不变） |
| `vercel.json` | Deployment Config | 设置 `buildCommand` 来运行注入脚本 |
| `scripts/inject-commit-info.sh` (new) | Build Script | 新建脚本，读取 git log 并替换占位符 |
| `.github/workflows/deploy.yml` | CI/CD Pipeline | 可能需要在 Vercel action 之前运行注入 |

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

### Documents to Update

- [ ] `docs/PRD/75-title-about-empty-prd.md` (本文件)
- [ ] `docs/TASKS/75-title-about-empty-prd.md` (任务文件)
- [ ] `vercel.json` (添加 buildCommand)
- [ ] `.github/workflows/deploy.yml` (可能微调)

---

## 4. Solution Comparison

> At least 2 approaches required.

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

**Cons:**
- Sed can break on commit messages with `/`, `&`, or special sed characters
- Modifies the file in-place (build artifact pollution if run locally without cleanup)

**Risk:** Low
**Effort:** Small (~0.5–1 hour)

### Alternative B: Node.js Build Script with JSON Reading

**Description:** Write a Node.js script that writes commit info to a separate JSON file or replaces tokens in `gameboy.html` during build.

**Pros:**
- JSON escaping handles special characters safely
- More robust than sed for complex commit messages
- Leverages existing Node.js runtime

**Cons:**
- Requires Node.js (already available in CI, but adds execution overhead)
- More code than the bash alternative

**Risk:** Low
**Effort:** Small (~0.5–1 hour)

### Alternative C: Vercel Serverless Function (API Endpoint for Commit Info)

**Description:** Create a Vercel serverless function that reads commit metadata and serves it via API.

**Pros:**
- Clean separation of concerns — HTML stays pristine
- No file modification needed

**Cons:**
- Adds a network request to the client on every ABOUT screen open
- Over-engineered for a simple metadata display
- Requires Vercel Functions (may add cold-start latency)
- Changes data flow from synchronous to asynchronous

**Risk:** Medium
**Effort:** Medium (~1–2 hours)

### Recommendation

→ **Alternative A (Build-time Sed Script)** 因为：
1. Simple, zero dependencies — pure bash + sed
2. Works with any CI/provider (GitHub Actions, Vercel, Netlify)
3. Only ~10 lines of code
4. Easy to test locally
5. Can handle special characters in commit messages (escaping)

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Condition | Expected |
|---|-----------|----------|
| 1 | **Deployed build** | ABOUT screen shows real commit hash (7-char SHA), message, and date |
| 2 | **Local file:// access** | `N/A` fallback (guard catches unreplaced placeholders) |
| 3 | **Vercel Preview Deployments** | Shows head commit of the PR branch |

### Edge Cases

| # | Condition | Expected Behavior |
|---|-----------|-------------------|
| 1 | **No git repo / no `git` binary** | Build script detects failure → placeholders remain → runtime guard shows `N/A` |
| 2 | **Shallow clone (CI environments)** | `git log -1` works correctly even on shallow clones |
| 3 | **Commit message with special characters** | Build script must properly escape characters |
| 4 | **Empty repository (no commits)** | `git log -1` fails → fallback → `N/A` |

### Failure Paths

1. **Sed fails on commit message with `/`:** 使用 Node.js 进行 JSON escaping 作为后备
2. **Build script not executed:** 占位符保持原样 → `N/A` fallback（安全降级）

> 这些直接成为 Plan 阶段的测试用例。

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/gameboy.html` | Stable | Low |
| `vercel.json` | Stable | Low |
| `.github/workflows/deploy.yml` | Stable | Low |

### Blocks

无。

### Preparation Needed

- [ ] 创建 `scripts/inject-commit-info.sh`
- [ ] 更新 `vercel.json` 添加 `"buildCommand"`

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Implementation: Proposed Solution

#### Build Script: `scripts/inject-commit-info.sh`

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
- Or add the script call to the deploy workflow in `deploy.yml` before the Vercel action step
