# Review: PR #71 — [Research] #70 Food collision bug research

| Reviewer | Date |
|----------|------|
| Subagent | 2026-07-09 |

## Gate Evaluation

### 1. Problem / Root Cause ✓ — PASS

**Status: ✅ PASS**

The PR correctly identifies the root cause: an **early-return ordering bug** in `public/src/engine/collision.js` lines 78-80 where:

```js
if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
  return ['damage'];  // ← early return before food entity check
}
```

This executes before the food entity lookup (line ~103), masking any food on WALL/STONE_WALL cells. Verified against actual source code — the code path diagram in the PRD accurately describes the execution flow. Root cause is clear and correct.

**Note:** The PR also correctly notes this is an ordering bug — not a placement bug (food is typically placed on FLOOR by `placeFoodInRoom()`), but a collision detection bug that manifests when food ends up on a wall cell through runtime manipulation or edge cases.

---

### 2. Impact — PASS

**Status: ✅ PASS**

The PRD documents a comprehensive impact table covering 7 affected game features:

| Feature | Impact |
|---------|--------|
| Food eating 🍎 | Snake cannot eat food on wall cells |
| Score accumulation | Score opportunities lost |
| Snake growth | Growth blocked from wall-cell food |
| Emergency respawn | Stuck food if respawned on wall |
| Enemy food stealing | Enemies can consume but snake can't |
| Room transition food | Boundary masking possible |
| Observability | Food visible but eating gives damage |

Severity correctly assessed as **Critical** — eating is the core mechanic.

---

### 3. Alternatives ≥ 2 — PASS

**Status: ✅ PASS**

Three alternatives documented (exceeds requirement of 2):

| Alternative | Approach | Verdict |
|------------|----------|---------|
| **A (recommended)** | Merge results — `results.push('damage')` instead of early return | ✔ Recommended — minimal change, correct semantics |
| **B** | Reorder entity checks before tile checks | Viable but duplicates room lookup logic |
| **C** | Track food positions as separate param | Targeted but changes function signature |

Alternative A is well-justified as the recommendation, with clear pros/cons for each option. Implementation notes for the corresponding `tick()` change in `core.js` are also provided.

---

### 4. Boundary Cases ≥ 3 — PASS

**Status: ✅ PASS**

Seven boundary cases documented (exceeds requirement of 3):

| # | Boundary | Analysis |
|---|----------|----------|
| 1 | Food at map edge (world boundary) | Bounds check correctly takes priority |
| 2 | Food on door cell during transition | Works correctly (DOOR ≠ WALL) |
| 3 | Food + enemy on same cell | Both returned; food processed first in tick |
| 4 | Multiple food at same position | Only first consumed per tick (acceptable) |
| 5 | Food on STONE_WALL | Same WALL masking bug — fixed by Alternative A |
| 6 | Food on SPIKE/DEATH_WALL | Death takes priority (correct behavior preserved) |
| 7 | Legacy mode (!world) | Separate bounds check masks food at x=0 |

Each boundary includes the scenario, current behavior, expected behavior, and mitigation notes. Boundary 6 (SPIKE/DEATH_WALL) is correctly identified as intentionally NOT fixed.

---

### 5. PRD Document — PASS

**Status: ✅ PASS**

File exists at `docs/PRD/70-food-collision-bug-prd.md` (12.5K). Content includes:

- ✅ Clear root cause with code path diagram
- ✅ Step-by-step reproduction cases
- ✅ Impact analysis with feature table
- ✅ Three fix alternatives with pros/cons
- ✅ Seven boundary cases with analysis
- ✅ Detailed fix plan (3 steps: collision.js → core.js → tests)
- ✅ Files changed list
- ✅ Verification checklist (7 items)

The PRD is well-structured and comprehensive.

---

## Overall Verdict: **PASS** ✅

All 5 quality gates pass with no concerns. The research is thorough, the root cause is correctly identified, and the recommended fix (Alternative A — merge results) is well-justified.

### Next Steps (executed as part of review workflow)
1. ✅ Merge PR #71 via squash
2. ✅ Update issue #70 labels (add `workflow/plan`, remove `workflow/research`)
3. 🔄 Spawn plan subagent for issue #70
