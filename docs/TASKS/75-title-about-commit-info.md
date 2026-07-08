# Tasks: #75 — Title About Screen Commit Info Shows N/A

> Parent Issue: #75
> Source: `docs/DESIGN/75-title-about-commit-info.md`
> Priority: Low
> Effort: ~1–2 hours (total across all phases)

---

## Priority Legend

| Priority | Meaning |
|----------|---------|
| **P0** | Must-have — core fix |
| **P1** | Nice-to-have — polish, edge cases, test hardening |

---

## Phase 1: Inject Script & Pipeline Config

**Goal:** Create the build-time injection script and wire it into `vercel.json`. This is the core fix that replaces placeholder tokens with real git metadata during deployment.

**Depends on:** Nothing

### Files & Changes

| # | File | Action | Priority | Lines |
|---|------|--------|----------|-------|
| 1.1 | `scripts/inject-commit-info.sh` | CREATE | P0 | ~25 |
| 1.2 | `vercel.json` | MODIFY | P0 | ~5 |

### Step Details

**1.1 — Create `scripts/inject-commit-info.sh`:**

Create shell script with:
- `git log -1 --format="%h"` for abbreviated commit hash
- `git log -1 --format="%s"` for commit message
- `git log -1 --format="%ai"` for author date (ISO 8601)
- Node.js JSON escaping for safe sed replacement of commit message
- Fallback: if git fails, outputs "unknown" → placeholders stay → runtime guard shows N/A
- `sed -i` in-place replacement of `__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_DATE__`
- `set -euo pipefail` for strict error handling
- Echo summary on success

**1.2 — Modify `vercel.json`:**

```json
{
  "buildCommand": "bash scripts/inject-commit-info.sh",
  "outputDirectory": null,
  "framework": null,
  "rewrites": [],
  "redirects": []
}
```

### Verification

| Check | Method |
|-------|--------|
| Script runs without errors | `bash scripts/inject-commit-info.sh` exits 0 |
| Placeholders replaced | `grep __COMMIT_ public/gameboy.html` returns empty |
| Real values present | `grep -E 'hash:|message:|date:' public/gameboy.html` shows non-placeholder values |
| `vercel.json` valid | `cat vercel.json | python3 -m json.tool` parses successfully |

---

## Phase 2: Testing & Validation

**Goal:** Test the injection script in multiple environments and verify the existing test suite still passes.

**Depends on:** Phase 1 complete

### Files & Changes

| # | File | Action | Priority | Lines |
|---|------|--------|----------|-------|
| 2.1 | `tests/test-inject-commit-info.sh` | CREATE | P1 | ~60 |
| 2.2 | `tests/metroidvania-snake.test.js` | NO CHANGE (verify) | P0 | 0 |

### Step Details

**2.1 — Create `tests/test-inject-commit-info.sh`:**

Shell-based test script with three test cases:

**Test 1: Basic replacement in real repo**
```bash
test_basic_replacement() {
  cp public/gameboy.html /tmp/gameboy.html.backup
  bash scripts/inject-commit-info.sh
  # Verify no __xxx__ tokens remain
  if grep -q '__COMMIT_' public/gameboy.html; then
    echo "FAIL: placeholders not replaced"
    return 1
  fi
  # Verify real hash present (7-char hex)
  if ! grep -qE '"hash": "[a-f0-9]{7}"' public/gameboy.html; then
    echo "FAIL: hash not injected"
    return 1
  fi
  # Restore
  cp /tmp/gameboy.html.backup public/gameboy.html
  echo "PASS: basic replacement"
}
```

**Test 2: Fallback without git repo**
```bash
test_no_git_repo() {
  TMPDIR=$(mktemp -d)
  cat > "$TMPDIR/gameboy.html" << 'EOF'
<script>window.__COMMIT_INFO = {hash: "__COMMIT_HASH__", message: "__COMMIT_MSG__", date: "__COMMIT_DATE__"};</script>
EOF
  export GIT_CEILING_DIRECTORIES="$TMPDIR"
  # Run script from tmpdir without .git
  cd "$TMPDIR"
  bash /path/to/scripts/inject-commit-info.sh
  grep -q '"unknown"' "$TMPDIR/gameboy.html" && echo "PASS: fallback" || echo "FAIL"
  rm -rf "$TMPDIR"
}
```

**Test 3: Special characters in commit message**
```bash
test_special_chars() {
  TMPDIR=$(mktemp -d)
  cd "$TMPDIR"
  git init
  git config user.email "test@test.com"
  git config user.name "Test"
  echo "test" > test.txt
  git add test.txt
  git commit -m 'feat: fix "quotes" & special/chars `backtick`'
  cp /path/to/public/gameboy.html .
  bash /path/to/scripts/inject-commit-info.sh
  # Verify the replacement didn't break HTML
  grep -q 'feat' gameboy.html && echo "PASS: msg injected" || echo "FAIL"
  # Verify JSON is still valid
  grep -qE '"message": "[^"]*"' gameboy.html && echo "PASS: JSON valid" || echo "FAIL"
  rm -rf "$TMPDIR"
}
```

**2.2 — Verify existing tests still pass:**
```bash
npm test
# Expected: all tests pass, including commitInfo fallback test
```

---

## Phase 3: Deploy Verification

**Goal:** Ensure the fix works end-to-end in CI — the about screen should now display real commit data on the deployed site.

**Depends on:** Phase 1 complete, Phase 2 passing locally

### Steps

| # | Step | Details |
|---|------|---------|
| 3.1 | Merge implement PR to master | PR is labeled `workflow/implement` → triggers deploy workflow |
| 3.2 | Check Vercel deploy logs | Verify `[inject-commit-info] Injected: <hash> — <msg>` appears in build logs |
| 3.3 | Visit deployed site | Navigate to ABOUT screen |
| 3.4 | Inspect commit info | Verify Commit hash, Msg, Date show real values (not N/A) |
| 3.5 | Run E2E tests | `npm run test:e2e` (headless) to verify no regressions |

### Rollback (if deploy fails)

| Failure Mode | Action |
|--------------|--------|
| Build script crashes deploy | Create hotfix PR: set `"buildCommand": null` in `vercel.json`, merge immediately |
| Runtime error on about screen | Same as above — revert to no build command, then debug script locally |
| Commit message breaks HTML | Add stronger JSON escaping in the script; re-deploy via P0 hotfix |

---

## Phase 4: Edge Case Hardening (Optional)

**Goal:** Handle edge cases that may not occur in normal CI but should be robust for completeness.

**Depends on:** Phase 1–3 complete

**Priority:** P1 (nice-to-have)

| # | Task | Description |
|---|------|-------------|
| 4.1 | Commit message truncation | If commit msg is very long (>120 chars), truncate for display |
| 4.2 | Non-ASCII commit messages | Test with CJK characters (relevant for Chinese commit messages) |
| 4.3 | Multi-word commit message date | `%ai` format includes timezone; consider `%ad --date=short` for cleaner display |
| 4.4 | Cross-platform sed compatibility | macOS `sed -i` requires empty extension `-i ''`; Linux `-i` works directly. Ensure CI runs Linux so no issue, but document |
| 4.5 | Create CI test step | Add a GitHub Actions step that runs `tests/test-inject-commit-info.sh` on PRs with `workflow/implement` label |

---

## Phase Dependencies

```
Phase 1 (Script + Config) ← no deps
    └── Phase 2 (Local Tests) ← depends on Phase 1
        └── Phase 3 (Deploy Verify) ← depends on Phase 1 + Phase 2
            └── Phase 4 (Edge Cases) ← optional, depends on 1-3
```

All P0 work is in Phase 1. Phase 2 provides test coverage. Phase 3 validates in production. Phase 4 is optional polish.

---

## Effort Summary

| Phase | Tasks | Effort | Owner |
|-------|-------|--------|-------|
| 1 — Injection Script & Pipeline Config | 2 tasks (create script, modify vercel.json) | ~30 min | Implement agent |
| 2 — Testing & Validation | 1 task (test script), verify existing tests | ~30 min | Implement agent |
| 3 — Deploy Verification | 5 steps (merge, check logs, verify site) | ~30 min | Tester / CI |
| 4 — Edge Case Hardening | 5 tasks (optional) | ~30 min | Implement agent (if time) |
| **Total (P0)** | **Phase 1 + Phase 2 + Phase 3** | **~1.5 hours** | |
