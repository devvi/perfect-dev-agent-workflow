# Tasks: #82 — About菜单Commit内容显示不正确

| 字段 | 值 |
|------|----|
| Issue | #82 |
| 优先级 | P1 |

## Overview

Vercel 部署后在 ABOUT 页面看到 `Commit: unknown` / `Msg: unknown` / `Date: unknown`。根本原因是 `scripts/inject-commit-info.sh` 在 Vercel 构建环境（无 `.git/`）中用 `git log -1` 读取元数据失败，回退到 `"unknown"` 字符串。

修复方案：在注入脚本中添加 Vercel 系统环境变量（`VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`）作为第一优先级来源，`git log -1` 作为本地开发回退，两者都不可用则跳过替换（运行态 guard 显示 N/A）。Source: `docs/DESIGN/82-about-menu-commit-info.md`.

---

## Phase 1: Script Refactor — Priority Chain (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 1.1 | `scripts/inject-commit-info.sh` | **MODIFY**: Add Vercel env var detection at top of script: check `VERCEL_GIT_COMMIT_SHA`, `VERCEL_GIT_COMMIT_MESSAGE`. Truncate SHA to 7 chars (`${var:0:7}`). Date: `git log -1 --format="%ai"` with SHA or fallback `"N/A"`. Add graceful skip path (exit 0, no replacement) when neither env vars nor git available | 无 | P0 |
| 1.2 | `scripts/inject-commit-info.sh` | **MODIFY**: Remove `set -e` from script header — individual command failures (e.g., `git log -1` in no-git env) must not crash the script | 1.1 | P0 |
| 1.3 | `scripts/inject-commit-info.sh` | **MODIFY**: Ensure the skip path logs a clear warning: `[inject-commit-info] WARNING: No git commit info available. Placeholders will remain (runtime guard shows N/A).` | 1.1 | P0 |

### Phase 1 Verification

| Check | Method |
|-------|--------|
| Script exits 0 in Vercel-like env (no .git/) | `bash scripts/inject-commit-info.sh` in tmpdir without `.git/` → exits 0 |
| Script exits 0 in Vercel-like env WITH mock env vars | `VERCEL_GIT_COMMIT_SHA=abc1234... bash scripts/inject-commit-info.sh` in tmpdir → exits 0, SHA truncated to 7 chars |
| Script still works locally | `bash scripts/inject-commit-info.sh` in repo root → replaces tokens with real git metadata |
| Placeholders survive when both sources unavailable | No env vars, no `.git/` → `grep __COMMIT_HASH__ public/gameboy.html` returns match |

---

## Phase 2: Test Updates (P0)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 2.1 | `tests/test-inject-commit-info.sh` | **MODIFY**: Update Test 2 (fallback without git) — replace assertion from `"unknown"` to placeholder survival + exit 0 | 1.1–1.3 | P0 |
| 2.2 | `tests/test-inject-commit-info.sh` | **ADD**: Test 4 — Vercel env var simulation. Set mock `VERCEL_GIT_COMMIT_SHA` and `VERCEL_GIT_COMMIT_MESSAGE`, verify truncated hash and message in output | 1.1 | P1 |
| 2.3 | `tests/test-inject-commit-info.sh` | **ADD**: Test 5 — Both env vars and git unavailable. Verify graceful exit 0 and placeholder survival | 1.1 | P1 |
| 2.4 | — (Manual) | Run all tests: `bash tests/test-inject-commit-info.sh` — all 5 tests pass (3 existing + 2 new) | 2.1–2.3 | P0 |

### Phase 2 Verification

| Check | Method |
|-------|--------|
| Test 2 (no git) passes with new behavior | `bash tests/test-inject-commit-info.sh` Test 2 ✅ |
| Test 4 (Vercel vars) passes | Mock env vars → correct truncated hash ✅ |
| Test 5 (both missing) passes | Placeholders survive, exit 0 ✅ |
| All 5 tests pass in one run | `bash tests/test-inject-commit-info.sh` → `5 passed` |

---

## Phase 3: Deploy Verification (P0)

| Step | Details | 前置 |
|------|---------|-------------|
| 3.1 | Merge implement PR to master — PR gets label `workflow/implement` → triggers deploy workflow | 1.1–1.3, 2.4 |
| 3.2 | Check Vercel deploy logs — verify `[inject-commit-info] Injected: <hash> — <msg>` appears | 3.1 |
| 3.3 | Visit deployed site — navigate to ABOUT screen (https://perfect-dev-agent-workflow.vercel.app) | 3.1 |
| 3.4 | Inspect commit info — verify Commit shows 7-char hex, Msg shows commit summary, Date shows timestamp (not "unknown") | 3.3 |
| 3.5 | Run automated E2E tests — `npm run test:e2e` (if exists) or `npm test` | 3.1 |
| 3.6 | Trigger a PR preview deploy — verify commit info is correct for PR branch head commit | 3.1 |

### Rollback (if deploy breaks)

| Failure Mode | Action |
|--------------|--------|
| Script crashes Vercel build (exits non-zero) | Hotfix: revert script to #75 version — injects "unknown" (broken but non-blocking) |
| Runtime error on ABOUT screen | Revert and debug; `vercel.json` buildCommand unchanged, only script logic affected |
| Vercel env var names changed | Check Vercel docs for updated names; patch script |

---

## Phase 4: Documentation & Hardening (P1)

| Step | 文件 | 变更 | 前置 | 优先级 |
|------|------|------|------|--------|
| 4.1 | `scripts/inject-commit-info.sh` | Add inline comment block documenting priority chain and expected env var sources | 1.1 | P1 |
| 4.2 | `README.md` | Document that Vercel env vars are the deploy-time source; update development setup instructions if needed | 1.1 | P2 |

---

## Dependency Graph

```
Phase 1: Script Refactor
├── 1.1 Add Vercel env var priority chain  ──┐
├── 1.2 Remove set -e  ──────────────────────┤
└── 1.3 Add skip-path warning ───────────────┤
                                              │
Phase 2: Test Updates                          │
├── 2.1 Update Test 2 assertion  ←── 1.1      │
├── 2.2 Add Test 4 (Vercel mock)  ←── 1.1     │
├── 2.3 Add Test 5 (both missing) ←── 1.1     │
└── 2.4 Run all tests            ←── 2.1-2.3  │
                                              │
Phase 3: Deploy Verification          │
├── 3.1 Merge to master  ←────────────┤
├── 3.2 Check Vercel logs  ←── 3.1    │
├── 3.3-3.4 Verify site  ←── 3.1      │
└── 3.5-3.6 E2E + preview  ←── 3.1    │
                                        │
Phase 4: Documentation (optional) ───────┘
```

## Summary: Changed Files

| 文件 | 变更类型 | 预估行数 | 阶段 |
|------|----------|----------|------|
| `scripts/inject-commit-info.sh` | 修改 | ±15 | 1 |
| `tests/test-inject-commit-info.sh` | 修改 | +40 | 2 |
