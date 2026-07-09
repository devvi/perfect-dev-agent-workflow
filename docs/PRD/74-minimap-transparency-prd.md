# Research: Semi-Transparent Minimap

> Parent Issue: #74
> Agent: research-agent
> Date: 2026-07-09
> Status: Open
> Priority: Low

---

## 1. Problem Definition

### Current Behavior

The minimap in `public/src/render/minimap.js` is rendered in the bottom-right corner of the game canvas (400×400). Its background is drawn as:

```js
ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
```

This dark overlay at **85% opacity** effectively blocks all game content beneath it — rooms, enemies, items, doors, and the player character are invisible when they occupy the bottom-right ~100×100 pixel region of the screen.

### Root Cause

The minimap was designed for maximum readability: a high-contrast dark background makes the colored room tiles, grid lines, door indicators, and player dot pop clearly. However, no consideration was given to **what lies beneath** the minimap — the game's own playable area. In a metroidvania-style game where rooms connect via doors in all directions, players frequently navigate into the bottom-right portion of the map and lose visual tracking of their character behind the opaque minimap overlay.

### Expected Behavior

Per issue #74:
1. The minimap background should be **semi-transparent**, allowing the player to see game content that would otherwise be obscured
2. The minimap must remain **fully readable** — room types, door indicators, player position, and labels must still be distinguishable
3. The transparency should be sufficient that a player can see themselves or level elements beneath the minimap area

### User Scenarios

- **Scenario A（正常游戏）：** 蛇移动到画面右下角区域 → 小地图是半透明的，玩家仍能看见自己的蛇头和周围环境
- **Scenario B（右下角战斗）：** 敌人在右下角区域，玩家与之战斗 → 小地图不遮挡敌人，玩家仍然可以正确判断位置
- **Scenario C（右下角捡食物）：** 食物出现在右下角 → 玩家可以透过小地图看到并吃掉它
- **Frequency:** 每次玩家进入画面右下角区域时触发

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?

The minimap was designed for maximum readability: a high-contrast dark background makes the colored room tiles, grid lines, door indicators, and player dot pop clearly. However, no consideration was given to **what lies beneath** the minimap.

### Why Change Now?

玩家经常在游戏过程中移动到画面右下角，这时小地图的不透明背景会完全遮挡该区域的游戏内容（敌人、食物、玩家自身），导致迷失方向。

### Previous Constraints

- 不能改变小地图的位置或大小
- 小地图必须保持可读性
- 所有更改仅限于 `minimap.js` 一个文件

---

## 3. Impact Analysis

| Area | Impact |
|------|--------|
| **Minimap rendering** (`public/src/render/minimap.js`) | Change background `rgba` alpha value and potentially adjust alpha on room tiles/grid. Single-file change. |
| **Gameplay visibility** | Players can now see their character and game elements when they move into the bottom-right area of the screen, reducing disorientation. |
| **Visual readability** | Minimap color contrast may be slightly reduced depending on the background content behind it. Colors must remain distinguishable. |
| **Test suite** (`tests/metroidvania-snake.test.js`) | Existing minimap test covers data backing (explored rooms count), not canvas rendering alpha values. Low impact. |
| **Backward compatibility** | No functionality change — only visual. All existing game logic, input handling, and state management unchanged. |

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/render/minimap.js` | Minimap Rendering | 将背景 alpha 从 0.85 改为 0.50 |

### Indirectly Affected Modules

无。只改变渲染 alpha 值。

### Data Flow

```
minimap.js (renderMinimap)
  │
  ├─ Background fillRect → alpha changed from 0.85 to lower value
  ├─ Room tile fillRect → may keep same color or lower alpha
  ├─ Grid lines → keep visible but behind background
  ├─ Player dot → must remain fully opaque to be seen
  └─ Label text → must remain readable
```

No data flow changes — same state/world consumed, same rendering pipeline.

### Documents to Update

- [ ] `docs/PRD/74-minimap-transparency-prd.md` (本文件)
- [ ] `docs/TASKS/74-minimap-transparency-prd.md` (任务文件)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Alternative A: Reduce Background Alpha (Recommended)

**Description:** Change the minimap background `rgba` alpha from `0.85` to a lower value (e.g., `0.4`–`0.55`). Keep room tiles, grid lines, and player dot at their current alpha (fully opaque). The background provides just enough contrast for readability while letting game content show through.

| Alpha Value | Effect | Readability |
|-------------|--------|-------------|
| 0.55 | Game content visible through background; rooms slightly muted | Good — room colors still contrast well |
| 0.45 | Game content clearly visible; rooms partially washed out | Adequate — colors still distinguishable |
| 0.35 | Game content very visible; background barely tints | Marginal — room colors lose contrast on bright backgrounds |
| 0.25 | Game content almost unobstructed; background nearly invisible | Poor — minimap hard to read on bright areas |

**Recommended alpha: 0.50** — best balance of transparency and readability.

**Pros:**
- Single-line code change (`0.85` → `0.50`)
- All minimap elements remain at full opacity (visible)
- No additional rendering cost
- No gameplay logic changes
- Quick to implement and test

**Cons:**
- Room tile colors are slightly muted against the lighter background
- Minimap readability depends on what's behind it

**Risk:** Low
**Effort:** Trivial (< 30 minutes)

**Code change:**
```diff
- ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
+ ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
```

### Alternative B: Use `ctx.globalAlpha` on the Entire Minimap

**Description:** Instead of changing just the background alpha, use `ctx.save()`, set `ctx.globalAlpha = 0.5`, render the entire minimap, then `ctx.restore()`. This makes background, room tiles, grid, player dot, and labels all semi-transparent uniformly.

**Pros:**
- Simplest code change — wrap the entire minimap rendering
- Uniform transparency looks consistent
- Game content clearly visible through the entire minimap area

**Cons:**
- Player dot becomes semi-transparent — harder to spot
- Label text ("MAP") becomes harder to read
- Grid lines nearly invisible
- Room color distinctions are muddied

**Risk:** Low
**Effort:** Trivial (< 15 minutes)

### Alternative C: Toggle-able Transparency via Keybind

**Description:** Add a keybind (e.g., `M` key for "minimap mode") that toggles between opaque (`0.85`) and semi-transparent (`0.50`) modes.

**Pros:**
- Player chooses their preferred mode
- No compromise between readability and transparency

**Cons:**
- Adds input handling complexity (key listener for toggle)
- Requires game state or local state modification
- Another keybinding to remember

**Risk:** Low
**Effort:** Small (~1 hour)

### Alternative D: Semi-Transparent Rooms Only, Keep Background Dark

**Description:** Keep the background at `0.85` opacity for readability, but make the individual room tiles semi-transparent.

**Pros:**
- Background stays dark — maintains overall contrast
- Room colors are visually "mixed" with underlying content

**Cons:**
- The dark background still blocks most of the underlying content
- Defeats the purpose partially — the main obstruction is the large dark patch

**Risk:** Low
**Effort:** Small (~15 minutes)

### Recommendation

→ **Alternative A** (Reduce background alpha to **0.50**) because:
1. Single-line change — lowest risk, fastest implementation
2. Background becomes see-through while all minimap elements stay opaque
3. Room colors remain distinguishable against the lighter background
4. Player dot, grid lines, and labels remain at full opacity
5. Aligns with the "light" research depth label of this issue

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Minimap in empty room | Player stands in a room with dark floor | Minimap background is visible but semi-transparent; room tiles below are distinguishable through it |
| 2 | Minimap over bright content | Player stands near a goal/save point in bottom-right area | The bright elements (gold, green) are visible through the minimap background |
| 3 | Player moves into minimap zone | Player character enters bottom-right ~100×100px area | Player character sprite is visible through the minimap background |
| 4 | Enemy in minimap zone | Enemy sprite overlaps minimap area | Enemy sprite shows through the minimap background |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | Very bright room background (white/dirt room) | Room tiles in minimap may have reduced contrast; room type colors must still be distinguishable |
| 2 | Very dark room background (cave/void room) | Minimap background blends with dark content underneath; grid lines and room borders must still be visible |
| 3 | Multiple colored room tiles stacked behind minimap | The semi-transparent background acts as a tint |
| 4 | Screen-wide flash effects (damage, explosions) | Minimap background should not interfere with flash readability |
| 5 | Small screen / zoomed view | Canvas is always 400×400; no responsiveness concerns |
| 6 | GameBoy Color palette | Colors are defined in `PALETTE` constants; transparency should work the same regardless of palette |
| 7 | Fog of war rooms (unexplored) | Fog rooms at `PALETTE.FOG = '#0a0a1a'` — must still appear distinct from explored/colored rooms |

### Out of Scope

| Item | Reason |
|------|--------|
| Minimap resizing | Not requested. MINIMAP_SIZE = 100 stays. |
| Minimap repositioning | Not requested. Stays bottom-right. |
| Toggle-able transparency | Adds complexity; use static alpha per Alternative A. |
| Minimap animation (fade-in) | Not requested. |
| Player dot glow/blink changes | Not requested. |
| Room color palette change | Colors are defined in constants; PRD scope is transparency only. |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | Alpha value too low (< 0.40) | Grid lines and room borders become hard to see. Acceptable if 0.50+ is chosen. |
| 2 | Alpha value too high (> 0.65) | Game content not sufficiently visible through minimap. Must test visually. |
| 3 | Alpha value breaks rendering on certain browser/GPU | `rgba()` and canvas `globalAlpha` are universally supported — no browser compatibility concern. |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk | Notes |
|-----------|--------|------|-------|
| `public/src/render/minimap.js` | Stable | Low | Single rendering function — trivial change |
| `public/src/engine/constants.js` (PALETTE) | Stable | None | No changes needed |
| Canvas 2D API (rgba) | Stable | None | Universally supported |

### Risks

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| Transparency too low on bright backgrounds | Medium | Test with all room types; choose 0.50 as baseline |
| Transparency too high (content too visible) | Low | At 0.50 the background still provides a dark tint |
| Existing test fails | Low | The only minimap test checks room data, not rendering |

### Blocks

无。

### Preparation Needed

无。

---

## 7. Spike / Experiment (Optional)

### Implementation Notes

#### 6.1 The Change

**File:** `public/src/render/minimap.js`

```diff
  // Background
- ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
+ ctx.fillStyle = 'rgba(10, 10, 26, 0.50)';
  ctx.fillRect(offsetX - 2, offsetY - 2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4);
```

That is the **only** change required. The room tiles, grid lines, door indicators, player dot, and label all remain at their current alpha values (fully opaque), ensuring readability.

### 6.2 Visual Rationale for 0.50

- At 0.50, the dark `#0a0a1a` background creates a noticeable dim overlay while still being see-through
- Room tile colors (`#306230` green, gold, `#aaccff` blue, `#ff4444` red) maintain contrast against the dimmed background
- The player dot at full opacity (`#00ff88`) remains clearly visible
- Grid lines at `rgba(48, 98, 48, 0.3)` will be partially dimmed by the background but still noticeable
- The border `#306230` stroke remains fully opaque

### 6.3 Visual Test Matrix

| Background Content | Readability at α=0.50 |
|-------------------|----------------------|
| Dark cave room (#0a0a1a) | Good — background nearly blends; room tiles contrast well |
| Green grass room | Good — green tiles #306230 still distinct |
| Gold/Goal room | Good — gold strongly contrasts with dark tint |
| White/dirt room | Adequate — tiles slightly muted but distinguishable |
| Player sprite | Visible — sprite in full color shows through |
| Enemy sprite | Visible — enemy color (red/purple) shows through |

### 6.4 Acceptance Criteria Checklist

- [ ] Minimap background uses `rgba(10, 10, 26, 0.50)` instead of `0.85`
- [ ] Player character is visible when standing in the bottom-right minimap area
- [ ] Room type colors (goal, save, gacha, key shrine, fog) remain distinguishable
- [ ] Player position dot remains clearly visible
- [ ] Grid lines and door indicators remain visible
- [ ] Label "MAP" remains readable
- [ ] All existing tests pass
- [ ] No gameplay logic or state changes
