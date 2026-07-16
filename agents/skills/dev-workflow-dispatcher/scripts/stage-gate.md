# stage-gate.py — Usage Guide

> Script location: `~/.hermes/scripts/stage-gate.py`
> First created: 2026-07-11, after PR #117 label gap incident

## What It Does

Deterministic PR/issue validator that runs at stage transition points.
Checks mechanical preconditions before allowing an agent to proceed.

## Usage

```bash
# Validate issue before spawning phase agent
python3 ~/.hermes/scripts/stage-gate.py --issue <N> --stage <research|plan|implement>

# Validate PR after creation (auto-fixes labels via REST API)
python3 ~/.hermes/scripts/stage-gate.py --pr <N>

# Validate both at once
python3 ~/.hermes/scripts/stage-gate.py --issue <N> --stage implement --pr <N>
```

## Exit Codes

| Code | Meaning | Action |
|------|---------|--------|
| 0 | All checks passed | Proceed |
| 1 | Check(s) failed (or auto-fix failed) | Block, do NOT proceed |
| 2 | Runtime error (API failure, etc.) | Investigate |

## Checks Performed

### `--pr` mode:
1. Branch name matches workflow pattern (`research/`, `plan/`, `impl/`)
2. Workflow label matches branch name (auto-fix via `gh issue edit` if missing)
3. PR body has `Parent: #N` or `Closes #N` reference (warn only)
4. PR is OPEN

### `--issue` mode:
1. Issue is OPEN
2. Correct workflow label exists for the target stage

## Key Technique: REST API Label Auto-Fix

`gh pr edit --add-label <label>` requires `read:org` scope on the PAT and fails.
Workaround: `gh issue edit <N> --add-label <label>` uses the Issues REST API
and only needs `repo` scope. Since GitHub treats PRs as a type of Issue,
this works identically.

```bash
# ❌ Fails without read:org
gh pr edit 117 --add-label workflow/implement

# ✅ Works with repo scope only
gh issue edit 117 --add-label workflow/implement
```

## Mandatory Execution Pattern

Always use `|| exit 1` to enforce execution:

```bash
python3 ~/.hermes/scripts/stage-gate.py --pr "$PR_NUM" || exit 1
```

Without `|| exit 1`, an agent might capture the output but ignore the exit code.
