# Pattern: Feature Already Exists in Committed Source

## Scenario

An issue asks for a new feature ("add version number to title screen"), but code exploration reveals the feature is **already rendered** in the source file.

## Worked Example (Issue #200)

### Step 1: Gather Context
- **Issue:** #200 — "[Feature] 标题页添加版本号显示" (depth/light)
- **Body:** "在标题页右下角添加版本号显示，灰色半透明小字 \"v1.0.0\"。只需在 `public/gameboy.html` 的 `renderTitleScreen()` 中加一行 `ctx.fillText()`。"

### Step 2: Search Source
```bash
search_files(pattern="renderTitleScreen", path="public/")
```
→ Found in `public/src/render/overlays.js` (NOT `public/gameboy.html`)

```bash
search_files(pattern="v1.0.0", path="public/src/render/overlays.js")
```
→ Lines 80–86 already render `v1.0.0` in bottom-right corner:
```javascript
ctx.save();
ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
ctx.font = '10px monospace';
ctx.textAlign = 'right';
ctx.fillText('v1.0.0', CANVAS_SIZE - 10, CANVAS_SIZE - 10);
ctx.restore();
```

### Step 3: Verify Feature is Committed (Not Local-Only)
```bash
git log --all --oneline --grep="parent #175" -- public/src/render/overlays.js
```
→ Found: `71e9f79 feat(#175): add version string v1.0.0 to title screen bottom-right (#178)`

```bash
gh pr list --state merged --search "parent #175"
```
→ PR #178 merged — feature is deployed.

### Step 4: Confirm Exact Match
- Same position: bottom-right at `CANVAS_SIZE - 10`
- Same text: `v1.0.0`
- Same style: `rgba(255,255,255,0.3)`, `10px monospace`
- Same wrapping: `ctx.save()` / `ctx.restore()`
- Tests exist in `tests/metroidvania-snake.test.js` (Phase 6, lines 2840–2920+)

**Conclusion:** Issue #200 is a duplicate of #175. Feature fully implemented and merged.

### The PRD Content (light depth example)

```
# PRD: 标题页添加版本号显示

## 1. Problem
**Current behavior:** Version `v1.0.0` already displayed at bottom-right of title screen (implemented by #175, merged in PR #178).

**Expected behavior:** Already satisfied by existing implementation.

## 2. Solution
Feature already implemented. No code changes needed.

**Existing implementation (public/src/render/overlays.js, lines 80–86):**
<code block of existing implementation>

## 3. Implementation Notes
- Files to edit: None
- Risk: None
- Recommendation: Close #200 as duplicate of #175
```

## Checklist for "Already Exists" Detection

- [ ] Issue keyword appears in source file (search_files pattern match)
- [ ] The matched code does what the issue asks (same position, style, label)
- [ ] Feature is committed (`git log` shows the feature commit; `git status` shows it's not uncommitted)
- [ ] A previous PR/issue is referenced in the commit message
- [ ] Tests exist for the feature
- [ ] All acceptance criteria from the issue are met by the existing implementation
- [ ] Issue body file path matches actual location (if not, note the discrepancy in PRD)
