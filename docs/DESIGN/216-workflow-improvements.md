# Workflow Improvements: Dependency Modeling & Progress Log

> Design document for two enhancements: **cross-issue dependency tracking** (inspired by Beads/Tasks DAG)
> and **execution progress logging** (inspired by activeForm/continuation context).
>
> Both stay within the existing GitHub Issues + event-processor architecture. No new tools.

## Problem Space

| Gap | Current State | Target |
|-----|---------------|--------|
| Cross-issue dependencies | Implicit in PRD text, no structured query | `Depends on: #N` in issue body, parsed by event-processor |
| Execution memory | Agent restarts from cold on every session | `docs/PROGRESS/<N>.md` with checkpoint state |
| Ready set computation | All `workflow/available` issues treated equally | BLOCKED label suppresses spawn until dependency resolves |

---

## 1. Dependency Modeling

### Data Source: Issue Body

New field in the PRD template (`## Dependencies` section):

```markdown
## Dependencies
<!-- Issues that must be resolved before this one can proceed -->
Depends on: #42              <!-- fully complete: status/done or CLOSED -->
Depends on (design): #49     <!-- design done: workflow/plan stage or beyond -->
```

Two granularity levels:

| Syntax | Meaning | Resolved when |
|--------|---------|---------------|
| `Depends on: #N` | Full | Target has `status/done` or CLOSED |
| `Depends on (design): #N` | Design only | Target at `workflow/plan+` |

### Integration: event-processor.py

New functions added to `scripts/event-processor.py`:

- `gh()` — subprocess wrapper for gh CLI calls
- `get_issue_body()` — fetch issue body via `gh issue view`
- `parse_dependencies()` — parse `## Dependencies` section regex
- `check_dependency_resolved()` — query GitHub, check labels/state
- `_has_unresolved_dependencies()` — public check, returns list

When processing `issues.labeled` events for `workflow/available`, before
generating `SPAWN: research`, the script checks dependencies. If unresolved
dependencies exist, it outputs `BLOCKED:` instead.

### Output Signals

| Signal | When | Cron Action |
|--------|------|-------------|
| `BLOCKED: issue=N,depends-on=#M(full)` | workflow/available has unresolved deps | `status/blocked` label, skip spawn |
| `UNBLOCKED: issue=N` | status/blocked now has all deps resolved | Restore `workflow/available` |

### Lifecycle Example

```
t=0   Issue #43: workflow/available, Depends on: #42
      → BLOCKED: issue=43,depends-on=#42(full)
      → label changed to status/blocked

t=10  Issue #42 completes → status/done
      → stalled scan detects #42 resolved
      → UNBLOCKED: issue=43
      → label: workflow/available

t=11  event-processor picks up → SPAWN: research,issue=43
```

---

## 2. Progress Log (Execution Memory)

### Data Source: `docs/PROGRESS/<N>-<slug>.md`

```
# Issue #42: Combat System

## Current State
Building combat pipeline with cooldown and damage calc.

## Done
- [x] Attack cooldown timer state machine
- [x] Damage calculation pipeline
- [ ] Hitbox collision detection

## Last Active
File: combat.js, function: applyDamage()
```

### Lifecycle

1. **Create** on implement agent spawn (from DESIGN doc layer breakdown)
2. **Update** after each logical unit (layer, bug fix, test batch)
3. **Read on resume** — before DESIGN doc, check PROGRESS first
4. **Archive on merge** — review agent extracts summary into GDD

### activeForm Convention

| Status | Example |
|--------|---------|
| Starting | "Reading DESIGN doc and planning layer breakdown" |
| Mid-engine layer | "Implementing engine-layer bossAI state machine" |
| Testing | "Running regression tests — 3 pre-existing failures" |
| Blocked | "Stuck on OpenCode error — falling back to direct edit" |
| Finalizing | "All layers committed, creating PR" |

Already implemented in `agents/skills/game-implement-agent/SKILL.md`.

## Monitoring

Verify in cron output:

```bash
grep -l "BLOCKED\|UNBLOCKED" ~/.hermes/cron/output/*.md
```
