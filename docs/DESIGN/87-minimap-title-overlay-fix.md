# Design: #87 — 右下角小地图显示修复

> Parent Issue: #87
> Agent: subagent (plan)
> Date: 2026-07-09

---

## 1. Architecture Overview

```
render() ──► state.gameState === 'playing'?
                │
                ├─ YES ──► renderMinimap()
                │             │
                │             ▼
                │          ctx.save()
                │          ctx.globalAlpha = 0.50
                │          ├─ fillStyle 'rgba(10,10,26,1.0)'  (background, with globalAlpha → α=0.50)
                │          ├─ room color blocks               (with globalAlpha → α=0.50)
                │          ├─ door indicators                 (with globalAlpha → α=0.50)
                │          ├─ grid lines                      (with globalAlpha → α=0.50)
                │          ├─ player position                 (with globalAlpha → α=0.50)
                │          └─ ctx.restore()
                │          ctx.save()
                │          ├─ "MAP" label (ctx.globalAlpha = 1.0, fully opaque)
                │          └─ ctx.restore()
                │
                └─ NO  ──► skip minimap entirely, go to renderOverlay()
```

### Module Responsibility Split

| Module | Role | Change |
|--------|------|--------|
| `renderer.js` | Render orchestration — decides what to draw per frame | Add `gameState` guard around `renderMinimap()` |
| `minimap.js` | Draws the minimap panel (background, rooms, doors, grid, player, label) | Wrap entire draw in `globalAlpha=0.50`; set background to fully opaque (since `globalAlpha` handles the transparency); keep "MAP" label fully opaque via local save/restore |

### Data Flow

- Render entry point: `render(ctx, state, world)`
- `state.gameState` is checked by `renderer.js`
- `ctx` (CanvasRenderingContext2D) is passed to `renderMinimap()`
- The `globalAlpha` only affects the minimap drawing region — isolated by `ctx.save()/ctx.restore()`
- No new state variables, no new events, no breaking data flow changes

---

## 2. Detailed Design

### 2.1 PRD Recommendation: Approach A (adopted)

As specified by the PRD research, Approach A is selected:

1. **Conditional rendering** in `renderer.js` — guard the `renderMinimap()` call behind `state.gameState === 'playing'`
2. **Global alpha** in `minimap.js` — wrap the entire minimap drawing in `ctx.save() / ctx.globalAlpha = 0.50 / ctx.restore()`
3. **Background alpha adjustment** — change background from `rgba(10,10,26,0.50)` to `rgba(10,10,26,1.0)` because the `globalAlpha=0.50` already provides the transparency
4. **Label opacity preservation** — "MAP" label drawn with a separate `save()/globalAlpha=1.0/restore()` inside the main save block

### 2.2 Code Snippets

**Part 1 — `public/src/render/renderer.js`:**

```js
// Before:
renderMinimap(ctx, state, world);

// After:
if (state.gameState === 'playing') {
  renderMinimap(ctx, state, world);
}
```

**Part 2 — `public/src/render/minimap.js`:**

```js
export function renderMinimap(ctx, state, world) {
  const offsetX = 400 - MINIMAP_SIZE - 8;
  const offsetY = 400 - MINIMAP_SIZE - 8;

  // === Wrap entire minimap in globalAlpha ===
  ctx.save();
  ctx.globalAlpha = 0.50;

  // Background (now fully opaque; globalAlpha handles the 50% transparency)
  ctx.fillStyle = 'rgba(10, 10, 26, 1.0)';
  ctx.fillRect(offsetX - 2, offsetY - 2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4);

  // Room color blocks, door indicators, grid lines, player position
  // ... (all existing code between background and label, unchanged) ...

  // === End of semi-transparent block ===
  ctx.restore();

  // === "MAP" label: fully opaque ===
  ctx.save();
  // globalAlpha defaults to 1.0 after save()
  ctx.fillStyle = '#8bac0f';
  ctx.font = '6px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', offsetX, offsetY - 4);
  ctx.restore();
}
```

### 2.3 Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Transparency mechanism | `ctx.globalAlpha` | One-line change vs. manually adjusting every `fillStyle`; uniformly semi-transparent; no color duplication |
| Background fill alpha | 1.0 (fully opaque) + globalAlpha 0.50 → effective α=0.50 | Consistent with the uniform transparency approach; avoids double multiplication |
| Label handling | Local `save()/restore()` with `globalAlpha=1.0` | Only 3 lines extra; keeps label readable; the PRD explicitly wants this |
| Condition check location | `renderer.js` | Single orchestration point; no need to change `minimap.js` interface |
| Game states included | Only `'playing'` | Title, gameover, won, paused → minimap hidden (as intended) |
| Player dot opacity | α=0.50 (via globalAlpha) | Uniform with rest of minimap; `#00ff88` at 50% is still clearly visible |

### 2.4 Color Consistency Table

| Element | Original (Pre-#74) | Post-#74 (broken) | Post-#87 (fixed) |
|---------|-------------------|--------------------|-------------------|
| minimap background | `rgba(10,10,26,0.85)` | `rgba(10,10,26,0.50)` | `rgba(10,10,26,1.0)` × 0.50 = `rgba(10,10,26,0.50)` |
| room color blocks | `#306230` etc. (α=1.0) | `#306230` etc. (α=1.0) | `#306230` × 0.50 = effective 50% opacity |
| door indicators | opaque | opaque | 50% opacity (via globalAlpha) |
| grid lines | `rgba(48,98,48,0.3)` | unchanged | 50% of 0.3 = 15% effective |
| player dot | `#00ff88` (α=1.0) | unchanged | 50% opacity |
| "MAP" label | `#8bac0f` (α=1.0) | unchanged | unchanged (local protect) |

---

## 3. Files Changed

| File | Change Description | Estimated Lines |
|------|-------------------|-----------------|
| `public/src/render/renderer.js` | Wrap `renderMinimap()` in `if (state.gameState === 'playing')` guard | +3 / -1 |
| `public/src/render/minimap.js` | Wrap draw in `ctx.save()/globalAlpha=0.50/restore()`; change background alpha to 1.0; local save/restore for label | +6 / -1 |
| **Total** | | **+9 / -2 (±9)** |

No other files need changes. No constants, types, or new modules.

---

## 4. Verification Checklist

### 4.1 Acceptance Criteria (from PRD)

- [ ] AC1: Title 界面右下角无小地图内容可见
- [ ] AC2: GameOver 界面右下角无小地图内容可见
- [ ] AC3: Won（胜利）界面右下角无小地图内容可见
- [ ] AC4: 游戏进行中小地图呈现均匀半透明效果
- [ ] AC5: 玩家蛇身位于右下角时透过 minimap 可见
- [ ] AC6: 小地图内房间类型色标仍可区分
- [ ] AC7: 从暂停恢复后小地图正常显示
- [ ] AC8: 所有 room 类型在 minimap 中色标可识别
- [ ] AC9: "MAP" 标签保持可读
- [ ] AC10: 所有现有测试通过

### 4.2 Test Specification (text only)

**Unit / Integration Test Cases:**

| Test ID | Scenario | Steps | Expected |
|---------|----------|-------|----------|
| T1 | title state minimap hidden | Set `state.gameState='title'`, call `render()`, inspect canvas at minimap region | No minimap draw calls; only overlay visible |
| T2 | playing state minimap shown | Set `state.gameState='playing'`, call `render()` | minimap drawn at correct position |
| T3 | gameover state minimap hidden | Set `state.gameState='gameover'` | No minimap visible |
| T4 | won state minimap hidden | Set `state.gameState='won'` | No minimap visible |
| T5 | paused state minimap hidden | Set `state.gameState='paused'` | No minimap visible |
| T6 | playing → paused → playing | Transition through states | minimap shows in playing, hides in paused, shows again |
| T7 | globalAlpha=0.50 verification | Check `ctx.globalAlpha` value inside minimap render | Set to 0.50 before draw, restored after |
| T8 | label opacity check | Check label draw call context | Label drawn with `globalAlpha=1.0` (or default) |
| T9 | minimap color blocks semi-transparent | Draw with known background content | Room colors visibly blend with background |
| T10 | background alpha consistency | Verify `rgba(10,10,26,1.0)` × `globalAlpha=0.50` | Effective α = 0.50 |

**Manual Visual Tests (on gameboy.html):**

| Test ID | Scenario | Steps | Expected |
|---------|----------|-------|----------|
| M1 | Title screen | Open gameboy.html | No minimap content behind title overlay |
| M2 | Gameplay minimap | Start game, navigate to see minimap | Minimap is uniformly semi-transparent |
| M3 | Overlap test | Move snake to bottom-right corner | Snake body visible through minimap |
| M4 | Game over | Die, observe screen | No minimap behind gameover overlay |
| M5 | MAP label | Check label in minimap | "MAP" remains clearly readable |

---

## 5. Regression Safety

- `renderer.js` change is a single guard condition — no other render functionality affected
- `minimap.js` change is wrapped in `ctx.save()/restore()` — canvas state is fully restored after the function returns
- No CSS, DOM, or event system changes
- No new dependencies
- The existing game loop and state machine are untouched
