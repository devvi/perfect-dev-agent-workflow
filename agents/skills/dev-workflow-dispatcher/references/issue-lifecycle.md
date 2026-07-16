# Issue Lifecycle Rules

## Golden Rule: Issue Must Stay Open Until Implement PR Merges

**The parent issue MUST NOT be closed until the implement PR has been merged.**

### Why This Matters
During testing, a route script bug caused issues to be closed prematurely. This broke the entire workflow chain: subsequent webhook events were ignored (GitHub routes `issues.labeled` events differently for closed issues), label advancement stalled, and the implement PR ended up merging against a closed issue.

### Enforcement

1. **Route script** — NEVER runs `gh issue edit --state closed`. Route script only writes to pending file.
2. **Operator agent** — Only closes the issue via `workflow-chain.yml` (GitHub Action), which closes it when the implement PR (label `workflow/implement`) is merged.
3. **Phase agents** — Do not manage issue state at all. They only create PRs with the correct `Parent: #N` body.

### Allowed Close Triggers

| Trigger | Actor | When |
|---------|-------|------|
| Implement PR merged | `workflow-chain.yml` | After implement PR auto-merge |
| Manual cancel | Human | Any time |
| Status/blocked with human notified | Operator | After 3 failed self-correct attempts |

### What To Check

Before closing an issue, verify:

```bash
# Is there an open implement PR?
gh pr list --head "impl/${ISSUE_N}-*" --state open --json number

# Is the implement PR merged?
gh pr view <PR_N> --json state,merged
```

Only close if `state == MERGED` for the implement PR.
