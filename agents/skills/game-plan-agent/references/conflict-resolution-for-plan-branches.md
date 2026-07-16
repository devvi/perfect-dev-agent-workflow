# Conflict Resolution for Plan Branches

When a plan PR reports "merge commit cannot be cleanly created", it typically means another agent merged a plan PR for the same issue before you.

## Resolution

```bash
# 1. Rebase onto master
git pull --rebase origin master

# 2. Force push (replace remote branch)
git push origin plan/${ISSUE_N}-<slug> --force
```

## Prevention

Run pre-flight checks before starting:

```bash
gh pr list --state all --json number,headRefName,state --search "plan/${ISSUE_N} in:headRefName"
```

If a merged plan PR already exists for this issue:
- Rebase your branch onto master
- Use `--force` push to replace the remote branch
- Plan branches have a single author per issue cycle

## Recovery

If the conflict is a genuine content conflict (not just a duplicate):

1. Read the conflicting files
2. Resolve each conflict
3. `git add` resolved files
4. `git rebase --continue`
5. `git push origin plan/${ISSUE_N}-<slug> --force`