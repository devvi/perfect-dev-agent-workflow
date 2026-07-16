# Cron Prompt Architecture (2026-07-14)

## Design Principle

The cron prompt must be **self-contained and minimal** — the LLM should be able to read it and act in a single pass without digesting 70KB+ of background documentation.

## Before: Skill-Backended Prompt

```
Cron config:
  skills: ["dev-workflow-dispatcher"]    # ← loaded ~100KB every tick
  prompt: <embedded inline prompt>

Problem: LLM spent 30s+ reading skill doc, missed sub-steps,
         hit 600s timeout frequently (every cycle ~2-3 timeouts)
```

## After: Isolated Prompt

```
Cron config:
  skills: []                               # ← no skill loading
  prompt: prompt/cron-prompt.md            # ← ~1.5KB / 45 lines
  script: event-processor.py               # ← unchanged

Output dropped from ~100KB to ~3KB per tick. No timeouts.
```

## Prompt Structure (~45 lines)

1. **SPAWN instructions** — 5 spawn types (review/self-correct/research/plan/implement)
2. **Stalled scan** — only handles research/* and plan/*; explicitly bans impl/*
3. **P1/P2 fallback** — non-standard events needing LLM judgment
4. **Silent** — no-op

## Key Constraints

- **Impl/* branches are off-limits.** Stalled scan never touches implement PRs. Only review agent (via SPAWN: review) merges them.
- **No Permanent Stall Protocol.** Pre-existing CI failures are escalated, not bypassed.
- **Prompt under 50 lines.** Longer prompts cause LLM to skip steps (verified: 1370-line skill doc caused 3 of 5 sub-steps to be missed).

## File Layout

```
dev-workflow-dispatcher/
├── SKILL.md                         → Full reference doc (humans)
├── prompt/
│   └── cron-prompt.md               → Active cron prompt (machine)
├── references/                      → Supporting documentation
└── scripts/
    └── event-processor.py           → Deterministic preprocessor
```
