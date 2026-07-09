# Tasks: #75 — Title About Screen Commit Info Shows N/A

| 字段 | 值 |
|------|----|
| Issue | #75 |
| 优先级 | P2 |

## Overview

标题画面 About 页面的 commit 信息显示为 N/A，因为构建注入脚本未就位。修复方案：创建 `scripts/inject-commit-info.sh` 构建脚本，在 Vercel 部署时用真实 git 元数据替换占位符。Source: `docs/DESIGN/75-title-about-commit-info.md`.

## Phase 1: Inject Script & Pipeline Config (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `scripts/inject-commit-info.sh` | CREATE shell script: `git log -1 --format="%h"` for abbreviated hash, `git log -1 --format="%s"` for message, `git log -1 --format="%ai"` for date. Node.js JSON escaping + `sed -i` in-place replacement of `__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_DATE__`. `set -euo pipefail` for strict error handling | 无 | P0 |
| 1.2 | `vercel.json` | MODIFY: Set `"buildCommand": "bash scripts/inject-commit-info.sh"` | 1.1 | P0 |

### Verification

| Check | Method |
|-------|--------|
| Script runs without errors | `bash scripts/inject-commit-info.sh` exits 0 |
| Placeholders replaced | `grep __COMMIT_ public/gameboy.html` returns empty |
| Real values present | `grep -E 'hash:|message:|date:' public/gameboy.html` shows non-placeholder values |
| `vercel.json` valid | `cat vercel.json | python3 -m json.tool` parses successfully |

## Phase 2: Testing & Validation (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/test-inject-commit-info.sh` | CREATE shell-based test script with three test cases (basic replacement, fallback without git, special characters) | 1.1 | P1 |
| 2.2 | — (Manual) | Verify existing tests still pass: `npm test` — all tests pass, including commitInfo fallback test | 1.1 | P0 |

## Phase 3: Deploy Verification (P0)

| Step | Details | 前置 |
|------|---------|-------------|
| 3.1 | Merge implement PR to master — PR is labeled `workflow/implement` → triggers deploy workflow | 1.1, 2.2 |
| 3.2 | Check Vercel deploy logs — verify `[inject-commit-info] Injected: <hash> — <msg>` appears in build logs | 3.1 |
| 3.3 | Visit deployed site — navigate to ABOUT screen | 3.1 |
| 3.4 | Inspect commit info — verify Commit hash, Msg, Date show real values (not N/A) | 3.3 |
| 3.5 | Run E2E tests — `npm run test:e2e` (headless) to verify no regressions | 3.1 |

### Rollback (if deploy fails)

| Failure Mode | Action |
|--------------|--------|
| Build script crashes deploy | Create hotfix PR: set `"buildCommand": null` in `vercel.json`, merge immediately |
| Runtime error on about screen | Same as above — revert to no build command, then debug script locally |
| Commit message breaks HTML | Add stronger JSON escaping in the script; re-deploy via P0 hotfix |

## Phase 4: Edge Case Hardening (Optional) (P1)

| Step | Task | 前置 |
|------|------|-------------|
| 4.1 | Commit message truncation — if commit msg is very long (>120 chars), truncate for display | 1.1 |
| 4.2 | Non-ASCII commit messages — test with CJK characters (relevant for Chinese commit messages) | 1.1 |
| 4.3 | Multi-word commit message date — `%ai` format includes timezone; consider `%ad --date=short` for cleaner display | 1.1 |
| 4.4 | Cross-platform sed compatibility — macOS `sed -i` requires empty extension `-i ''`; Linux `-i` works directly. Ensure CI runs Linux so no issue, but document | 1.1 |
| 4.5 | Create CI test step — add a GitHub Actions step that runs `tests/test-inject-commit-info.sh` on PRs with `workflow/implement` label | 2.1 |

## Dependency Graph

```
Phase 1 (Script + Config) ← no deps
    └── Phase 2 (Local Tests) ← depends on Phase 1
        └── Phase 3 (Deploy Verify) ← depends on Phase 1 + Phase 2
            └── Phase 4 (Edge Cases) ← optional, depends on 1-3
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 | 阶段 |
|------|----------|----------|------|
| `scripts/inject-commit-info.sh` | 新增 | ~25 | 1 |
| `vercel.json` | 修改 | ~5 | 1 |
| `tests/test-inject-commit-info.sh` | 新增 | ~60 | 2 |
