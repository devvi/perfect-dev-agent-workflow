# Cosmetic-Only PR Pre-Existing Failure Pattern (2026-07-14)

## Session Trace: PR #183 → Issue #180

**PR:** #183 — `feat(#180): ABOUT UI label Msg → Message`
**Branch:** `impl/180-about-msg-message`
**Source change:** 1 character in `public/src/render/overlays.js` — `'Msg:   '` → `'Message: '`
**Test changes:** Only ADDED new Issue #180 test blocks (3 tests) — NO modifications to existing tests

## CI Failure

6 test failures in `tests/metroidvania-snake.test.js`, ALL about wall collision mechanics:
1. Issue #22 — Wall collision → stuckCounter set (Issue #46)
2. Issue #22 — Snake length 1 hitting wall → stuck not gameover (Issue #46)
3. Phase 4/Test 1 — stuckCounter to STUCK_TICKS
4. Phase 4/Test 7 — single-segment snake reversal
5. Issue #70/C2 — Food + enemy at WALL cell
6. Issue #70/C4 — Snake length 1 hits wall with food

## Pre-Existing Verification

| Check | Result |
|-------|--------|
| Master CI (5 recent runs) | ALL failures, same pattern |
| Local vitest on master | 6 failed, 58 passed, 274 skipped, 15 todo |
| Local vitest on PR branch | 6 failed, 58 passed, 274 skipped, 15 todo |
| Identical assertion errors? | Yes — same test names, same line numbers |
| PR touches failing code? | No — only overlays.js (cosmetic text) |
| PR touches failing test file? | No — only ADDED new test blocks |
| Stash on PR branch | No PR-specific stashes |
| E2E Play Test | Passed (2/2 pages, 0 errors) |

## Action Taken

Self-correct agent was spawned with full pre-investigation context. The agent was expected to use the **Permanent Stall Protocol**:
1. Comment on PR documenting pre-existing CI
2. Create tracking issue for the CI failure
3. Merge via REST API (`gh api repos/.../pulls/183/merge -X PUT -f merge_method=squash`)
4. Manually trigger deploy (`gh workflow run deploy -f pr_num=183`)
5. Advance labels and close issue
6. Post-merge GDD update

## Key Technique: Targeted Test Comparison

Instead of running the full suite, use `-t` with a regex matching the failing test names:

```bash
npx vitest run -t "Issue #22|Issue #46|Issue #70|Phase 4"
```

This isolates the specific failures and completes in ~6.7s instead of ~10s for the full suite.

## Signal Strength

When ALL of these are true, the failures are virtually guaranteed to be pre-existing:

- PR source change is cosmetic only (text strings, comments, whitespace, CSS)
- PR test changes are additions only (new describe/it blocks, no modifications to existing tests)
- The failing tests are in a completely different domain (e.g., collision logic vs rendering text)
- Master CI has been failing with the same failures for 5+ consecutive runs
- Local vitest comparison shows identical failures on both branches
