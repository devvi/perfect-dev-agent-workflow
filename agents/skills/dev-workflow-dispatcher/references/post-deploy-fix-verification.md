# Post-Deploy Fix Verification

After a bug-fix workflow completes, verify the fix is actually deployed and working.

## Quick Check

```bash
# 1. Confirm deploy ran
gh run list --repo devvi/perfect-dev-agent-workflow --workflow deploy --limit 1 \
  --json conclusion,createdAt --jq '.[] | {conclusion, at: .createdAt}'

# 2. Check fix code is on production
curl -s "https://perfect-dev-agent-workflow.vercel.app/gameboy.html" | grep "changeDirection"
# Expected: multiple matches (fix code present)

# 3. Verify game loads
curl -s -o /dev/null -w "%{http_code}" "https://perfect-dev-agent-workflow.vercel.app/gameboy.html"
# Expected: 200
```

## Full Verification

```bash
# 1. What did the implement PR change?
gh pr diff <PR-N> --name-only
gh pr diff <PR-N> | grep -E "^[+-]" | grep -v "^[+-][+-][+-]" | head -30

# 2. Does the fix address the root cause from the Issue?
gh issue view <N> --json body --jq '.body' | head -20
# Compare with the PR diff — the fix should match the root cause

# 3. Run E2E teleport test
cd ~/.pda/perfect-dev-agent-workflow
node tests/play-test.mjs 2>&1 | tail -15
# Check regression scenarios pass (no FAIL lines)
```

## Pattern

Bug fix → deploy → verify fix on production → report result.
Don't just merge and move on. The fix is only real when the production URL proves it.
