# Design: #70 — Plan Progress — Food Collision Bug Fix

> Parent Issue: #70
> Agent: subagent
> Date: 2026-07-09

---

## 1. Architecture Overview

This document tracks the progress of implementing the fix for Issue #70 (Food Collision Returns `damage` Instead of `food`). The full design is in `docs/DESIGN/70-food-collision-design.md`.

### Planned Implementation

| Step | Description | Status |
|------|-------------|--------|
| Branch checkout | `plan/70-food-collision-fix` | ✅ Done |
| PRD research | Read issue #70 on GitHub | ✅ Done |
| Codebase reading | collision.js, core.js, tests, generator.js, world.js, constants.js | ✅ Done |
| Create DESIGN doc | `docs/DESIGN/70-food-collision-design.md` | ⬜ Pending |
| Create TASKS doc | `docs/TASKS/70-food-collision-fix.md` | ⬜ Pending |
| Open PR | Implementation PR | ⬜ Pending |

---

## 2. Detailed Design

See `docs/DESIGN/70-food-collision-design.md` for the complete design.

**Summary of changes:**
1. `public/src/engine/collision.js`: Replace early `return ['damage']` with `results.push('damage')` so entity checks still run
2. `public/src/engine/core.js`: In `tick()`, when combined `['damage', 'food']` present, remove food entity and award score before applying stuck+reverse penalty
3. `tests/metroidvania-snake.test.js`: Add new test block covering combined collision scenarios, edge cases, and regression checks

### Remaining Work

- [ ] Create DESIGN doc (this in progress)
- [ ] Create TASKS doc with implementation subtasks
- [ ] Open PR for implementation review

---

## 3. Files Changed

| File | Change Description | Est. Lines |
|------|--------------------|------------|
| `public/src/engine/collision.js` | Early return → results push | ±2 |
| `public/src/engine/core.js` | Handle combined damage+food in tick() | +10 |
| `tests/metroidvania-snake.test.js` | New test block | ~80 |

---

## 4. Verification Checklist

- [ ] All existing tests pass
- [ ] Food on WALL returns `['damage', 'food']`
- [ ] tick() processes combined collision correctly
- [ ] Food consumed on wall-food hit (no growth, but score awarded)
- [ ] Wall damage penalty still applies alongside food consumption
