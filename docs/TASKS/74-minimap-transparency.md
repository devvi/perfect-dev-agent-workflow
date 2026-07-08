# Tasks: #74 — 小地图半透明 (Minimap Semi-Transparent)

| Field | Value |
|-------|-------|
| Issue | #74 |
| Priority | Low |
| Author | plan-agent |

## Overview

Make the minimap background semi-transparent so game content in the bottom-right area is visible through it. The change is a single-line alpha adjustment in `public/src/render/minimap.js`, with supporting test updates.

**Design:** `docs/DESIGN/74-minimap-transparency.md` details the architecture and rendering analysis.

---

## Phase 1: Core Rendering Change (P0)

Single line change to the minimap background alpha value.

| Step | File | Change | Priority |
|------|------|--------|----------|
| 1.1 | `public/src/render/minimap.js` | Change `fillStyle` alpha from `0.85` to `0.50` | P0 |

### Step 1.1 Detail

**File:** `public/src/render/minimap.js`
**Location:** The `renderMinimap()` function, background `fillRect` statement

```js
// BEFORE:
ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';

// AFTER:
ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
```

**Dependencies:** None
**Risk:** Trivial — single character change in `0.85` → `0.50`

---

## Phase 2: Verify & Test (P1)

Confirm the change works correctly and all existing tests pass. Add new tests for the transparency change.

| Step | File | Change | Dependencies | Priority |
|------|------|--------|-------------|----------|
| 2.1 | `tests/metroidvania-snake.test.js` | Add unit test verifying alpha value in `fillStyle` is `0.50` | 1.1 | P1 |
| 2.2 | `tests/metroidvania-snake.test.js` | Add integration test that renders minimap with 4+ rooms and asserts no throw | 1.1 | P1 |
| 2.3 | Terminal | Run full test suite: `npm test` — confirm all existing tests pass | 1.1 | P1 |

### Step 2.1 Detail — Alpha Value Test

```js
// Light check: confirm the background alpha is 0.50
// (parse the source or validate the rendered pixel)
```

### Step 2.2 Detail — Smoke Test

Validate that `renderMinimap()` still completes successfully with various game states (no rooms explored, some rooms explored, all rooms explored).

### Step 2.3 — Regression

```bash
npm test
# Expected: all tests pass
```

---

## Phase 3: Visual Validation (P1)

| Step | Task | Criteria |
|------|------|----------|
| 3.1 | Load game in browser | Minimap renders at correct position |
| 3.2 | Visually confirm transparency | Player character is visible when standing in bottom-right minimap zone |
| 3.3 | Visually confirm room colors | All room types (green, gold, red, blue, fog) are distinguishable on minimap |
| 3.4 | Visually confirm player dot | Player position dot is clearly visible |
| 3.5 | Visually confirm grid & labels | Grid lines and "MAP" label remain readable |
| 3.6 | Edge case: dark room behind minimap | Cave/void room content shows through appropriately |
| 3.7 | Edge case: bright room behind minimap | White/dirt room content shows through but minimap colors still readable |

Each visual check should be documented as a screenshot or brief note. If any check fails, adjust alpha (e.g., `0.55` or `0.45`) and re-test.

---

## Phase 4: Cleanup & PR (P2)

| Step | Task | Dependencies |
|------|------|-------------|
| 4.1 | Review diff for unrelated changes | 1.1 |
| 4.2 | Add PR description referencing issue #74 with "Closes #74" | 4.1 |
| 4.3 | Open PR with label `enhancement` | 4.2 |

---

## Summary

| Phase | Effort | Key Deliverable |
|-------|--------|----------------|
| Phase 1 — Core Change | < 5 min | Single-line alpha change |
| Phase 2 — Verify & Test | ~15 min | Test updates + `npm test` pass |
| Phase 3 — Visual Validation | ~15 min | Manual visual checks |
| Phase 4 — Cleanup & PR | ~5 min | PR opened with "Closes #74" |
| **Total** | **~40 min** | |

## Branch

Implementation branch: `plan/74-minimap-transparency` (this plan)
Implementation PR will be on branch `impl/74-minimap-transparency`
