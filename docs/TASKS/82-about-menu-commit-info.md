# Tasks: #82 — About Menu Commit Info Shows "unknown" on Deployed Build

| 字段 | 值 |
|------|----|
| Issue | #82 |
| 优先级 | P2 |

## Overview

标题画面 About 页面的 commit 信息在部署版本中显示为 "unknown"，因为 `scripts/inject-commit-info.sh` 在 Vercel 构建环境中无法访问 `.git/` 目录，`git log -1` 失败后使用了 fallback 值 "unknown"。修复方案：修改构建脚本，优先使用 Vercel 系统环境变量 (`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`)，回退到 `git log -1` 用于本地开发。详见 `docs/DESIGN/82-about-menu-commit-info.md`。

**Root Cause:** Vercel 构建环境没有 `.git/` 目录，`git log -1` 失败 → fallback "unknown" 被注入 → 运行时守卫误判 "unknown" 为有效值。

## Phase 1: Script Modification (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `scripts/inject-commit-info.sh` | MODIFY: Add Vercel env var priority detection. Check `VERCEL_GIT_COMMIT_SHA` first, use first 7 chars. Use `VERCEL_GIT_COMMIT_MESSAGE` for message. Try `git log -1` for date (Vercel has no date env var). Keep existing `git log -1` block as fallback for local dev. Add `else` skip block for when neither source is available | 无 | P0 |

### Logic Change Details

Current script has two outcomes:
1. `git log -1` succeeds → real values injected
2. `git log -1` fails → "unknown" fallback injected (BUG)

New script has three outcomes:
1. Vercel env vars found → real SHA + message + `git log -1` date
2. No env vars, but `git log -1` works → real values from git (local dev)
3. Neither available → exit 0 without replacement → runtime guard shows "N/A"

### Verification

| Check | Method |
|-------|--------|
| Vercel env var path works | `VERCEL_GIT_COMMIT_SHA=abc1234deadbeef01234567 VERICEL_GIT_COMMIT_MESSAGE="test msg" bash scripts/inject-commit-info.sh` → `grep -c "unknown" public/gameboy.html` returns 0 |
| Local git fallback unchanged | `bash scripts/inject-commit-info.sh` inside repo → real values injected (same as #75 behavior) |
| Safe skip path works | Run in temp dir without `.git/` and without env vars → exit 0, HTML unchanged |
| SHA truncated correctly | `VERCEL_GIT_COMMIT_SHA=abcdef1234567890abcdef1234567890abcdef12 ...` → `grep "hash.*abcdef123" public/gameboy.html` returns 0 (only 7-char version present) |
| No "unknown" leak in CI path | After Vercel-style env var injection, no "unknown" remains |
| Existing behavior preserved | Normal `git log -1` path still works for local dev |

## Phase 2: Regression Testing (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | — (Manual) | Verify runtime guard still handles missing `window.__COMMIT_INFO` → ABOUT shows "N/A" | 1.1 | P0 |
| 2.2 | — (Manual) | Clear `__COMMIT_*` placeholders → run script → confirm `grep __COMMIT_ public/gameboy.html` returns empty | 1.1 | P0 |
| 2.3 | — (Manual) | Run `bash scripts/inject-commit-info.sh` in repo root → confirm exit 0 and correct values | 1.1 | P0 |

## Phase 3: Deploy Verification (P0)

| Step | Details | 前置 |
|------|---------|-------------|
| 3.1 | Merge implement PR to master — PR labeled `workflow/implement` triggers deploy workflow | 1.1, 2.1-2.3 |
| 3.2 | Check Vercel deploy logs — confirm `VERCEL_GIT_COMMIT_SHA` detection in build output | 3.1 |
| 3.3 | Visit deployed site — navigate to ABOUT screen | 3.1 |
| 3.4 | Inspect commit info — verify commit hash (7-char SHA), message, and date show **real values** (not "unknown", not "N/A") | 3.3 |
| 3.5 | Confirm `gameboy.html` served to client has real `__COMMIT_INFO` block | 3.1 |

### Rollback (if deploy fails)

| Failure Mode | Action |
|--------------|--------|
| Script crashes deploy | Set `"buildCommand": null` in `vercel.json` → merge hotfix → script disabled → runtime guard shows "N/A" |
| Date still "unknown" | Date from `git log -1` fails in Vercel → acceptable (minor cosmetic), can be improved in Phase 4 |
| Commit message garbled | Strengthen quoting/escaping, re-deploy |

## Phase 4: Date Hardening (Optional, P1)

| Step | Task | 前置 |
|------|------|-------------|
| 4.1 | Consider deriving date from commit content or skipping date field entirely | 1.1 |
| 4.2 | If Vercel adds date env var in future, update script to read it (monitor Vercel changelog) | 1.1 |

## Dependency Graph

```
Phase 1 (Script Modify)
    └── Phase 2 (Regression Tests) ← depends on Phase 1
        └── Phase 3 (Deploy Verify) ← depends on Phase 1 + Phase 2
            └── Phase 4 (Date Harden) ← optional, depends on 1.1
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 | 阶段 |
|------|----------|----------|------|
| `scripts/inject-commit-info.sh` | 修改 | ±15 | 1 |
