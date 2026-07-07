# Plan: 关卡障碍死亡惩罚迭代

> Issue: #22
> Agent: plan-agent
> Date: 2026-07-07
> Branch: `plan/22-obstacle-death-penalty`
> Base: main

---

## 1. Overview

将现有"撞墙即死"机制升级为三层惩罚体系，并新增屏幕震动反馈。

### 设计决策

**采用 Approach A（最小改动）**：不引入数值化伤害系统，仅修改碰撞返回值和处理分支。
- 改动 5-6 个文件，预计开发时间 < 2 小时
- 未来可平滑升级到伤害数值化（将 `'damage'` 改为 `{ type: 'damage', amount: 1 }`）
- 与现有数据流（tick → collision → state update → render）完全兼容

---

## 2. Detailed Implementation

### Phase 1: Constants — Add DEATH_WALL cell type

**File:** `public/src/engine/constants.js`
**Lines:** ~33-39

**Change:** Add `CELL.DEATH_WALL = 5`

```diff
// Cell types within a room
export const CELL = {
  FLOOR:        0,
  WALL:         1,
  CRACKED_WALL: 2,
  DOOR:         3,
  STONE_WALL:   4,
+ DEATH_WALL:  5,
};
```

### Phase 2: Collision — Differentiate wall types

**File:** `public/src/engine/collision.js`
**Function:** `checkSnakeCollision()` (~lines 9-66)

**Change:** Return `'damage'` for WALL/STONE_WALL, `'death'` for DEATH_WALL, remove `'wall'` return path.

Modified code block (current lines 33-38):

```diff
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
-   return ['wall'];
+   return ['damage'];
+ }
+ if (cellType === CELL.DEATH_WALL) {
+   return ['death'];
  }
```

**Impact:** Tests that check for `'wall'` in collision results will need to check for `'damage'` instead. Boundary wall cells (border of world, not border of room) are still `CELL.WALL`, so they return `'damage'`. The world-boundary check before (lines 27-30) remains — if the snake goes off the grid entirely (x < 0 or y < 0 or beyond max), it still returns `['wall']` as a safety catch (though this shouldn't happen in normal play with room borders).

**Also update in the same file:** `checkProjectileCollision()` (~lines 81-101)

Change projectile wall detection: projectiles should still hit/dissipate on WALL/STONE_WALL, but NOT on DEATH_WALL (projectiles should pass through or be absorbed, not destroy). Keep current behavior for projectiles vs WALL/STONE_WALL — they are permanent barriers for bullets.

### Phase 3: Core tick — Add damage/death handling

**File:** `public/src/engine/core.js`
**Function:** `tick()` (~lines 75-160)

**Change:** 
1. Replace the `'wall'` → gameover branch with `'damage'` handling (length-1 + screenShake)
2. Add `'death'` → gameover branch
3. Add `screenShake` state tracking
4. Add length=0 → gameover guard
5. Handle snake head position on damage (don't move into wall)

Current code (around lines 91-96):
```js
  // Wall collision (also applies without world)
  if (collisions.includes('wall')) {
    s.gameState = 'gameover';
    return s;
  }
```

Replace with:
```js
  // Damage collision — non-lethal wall bump
  if (collisions.includes('damage')) {
    // Don't move the snake head into the wall — stay in place
    s.snake = s.snake.slice(0, -1); // lose one segment
    s.score = Math.max(0, s.score - 5);
    s.screenShake = {
      intensity: 3,
      duration: 300, // ms — but tracked in ticks
      tickCounter: 0,
    };

    // If snake length reaches 0, game over
    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }

    // Do NOT process room transitions, food, or other collision results
    // when hitting a wall — just apply damage and continue
    // (skip the normal snake movement)
    return s;
  }

  // Death collision — instant game over
  if (collisions.includes('death')) {
    s.gameState = 'gameover';
    return s;
  }
```

**Important design decisions:**
- On `'damage'`, the snake head does **not** move into the wall cell — we return early before the snake movement code runs. This prevents the snake head from embedding in a wall cell and causing repeated collisions.
- After damage, we return `s` immediately (skipping food, door transition, enemy, projectile, etc. processing). This means if you hit a wall at the same time you'd hit food, the wall takes priority.
- `screenShake` added to state as an object with `{ intensity, duration, tickCounter }`. The game loop runs at ~50-60 ticks/sec. We track shake in tick counts.

**Also in core.js:** Add `screenShake` initialization to `createInitialState()` (~line 31):

```diff
  return {
    snake,
    direction: startDir,
    ...
    savePoint: null,
    gachaMessage: null,
+   screenShake: null,
  };
```

### Phase 4: Rendering — Screen shake

**File:** `public/src/render/renderer.js`
**Function:** `render()` (~lines 8-30)

**Change:** Apply `ctx.translate()` offset when `state.screenShake` is active, with exponential decay.

Modified render function:
```diff
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

+ // Apply screen shake transform
+ ctx.save();
+ if (state.screenShake) {
+   const intensity = state.screenShake.intensity;
+   // Random offset within intensity bounds
+   const offsetX = (Math.random() - 0.5) * 2 * intensity;
+   const offsetY = (Math.random() - 0.5) * 2 * intensity;
+   ctx.translate(offsetX, offsetY);
+ }

  // Clear
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(-state.screenShake ? 0 : 0, ...);

  // ... existing rendering ...

  // Scanlines
  renderScanlines(ctx);

+ // Restore transform after shake
+ if (state.screenShake) {
+   ctx.restore();
+ } else {
+   ctx.restore(); // always restore if we saved
+ }
}
```

Wait — this is more complex due to the canvas clearing. The shake offset means the clear rect also needs offset or we need to clear a larger area. Let me reconsider.

**Better approach:** Apply the shake transform as a wrapper around the render content, but clear first without shake:

```js
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

  // Clear (without shake — clear the full canvas)
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Apply screen shake
  ctx.save();
  if (state.screenShake) {
    const intensity = state.screenShake.intensity;
    const offsetX = Math.round((Math.random() - 0.5) * 2 * intensity);
    const offsetY = Math.round((Math.random() - 0.5) * 2 * intensity);
    ctx.translate(offsetX, offsetY);
  }

  // Render current room (with shake offset)
  renderRoom(ctx, state, world);
  renderHUD(ctx, state);
  renderMinimap(ctx, state, world);
  renderOverlay(ctx, state);
  renderScanlines(ctx);

  // Restore after shake
  ctx.restore();
}
```

**Screen shake decay logic** (run in `tick()` in core.js, OR in a new tick-phase function):

In `tick()`, after all updates, add screen shake decay:
```js
  // Decay screen shake
  if (s.screenShake) {
    s.screenShake.tickCounter++;
    const SHAKE_TICKS = Math.ceil(300 / (BASE_TICK_INTERVAL * (1 + (s.snake.length - 3) * SPEED_SLOPE)));
    // Simpler: fixed at ~15 ticks at typical speeds
    if (s.screenShake.tickCounter >= 15) {
      s.screenShake = null;
    } else {
      // Exponential decay: intensity *= 0.7 each tick
      s.screenShake.intensity *= 0.7;
      if (s.screenShake.intensity < 0.5) {
        s.screenShake = null;
      }
    }
  }
```

Actually, let me simplify. The shake duration should be in absolute frame count, not tick-relative. Since the render happens every requestAnimationFrame (probably ~60fps) while game ticks may be slower, the shake should be tracked separately.

**Better approach:** Track shake as frame-count-based state that's decayed in the render loop:

In `core.js` `tick()`, just set the shake state:
```js
s.screenShake = {
  intensity: 3,
  frameCounter: 0,
  maxFrames: 10, // ~167ms at 60fps — short but noticeable
};
```

In `renderer.js`, decay it each render frame:
```js
if (state.screenShake) {
  // Apply offset
  // ...
  state.screenShake.frameCounter++;
  if (state.screenShake.frameCounter >= state.screenShake.maxFrames) {
    state.screenShake = null;
  } else {
    state.screenShake.intensity *= 0.65; // exponential decay
  }
}
```

Hmm, but we shouldn't mutate state in the renderer. Let me keep the shake decay in the game loop instead.

**Final approach:** Track shake with tick-based decay in `tick()`:

```js
// Decay screen shake (happens every tick)
if (s.screenShake) {
  s.screenShake.frameCounter++;
  if (s.screenShake.frameCounter >= 10) { // ~10 ticks of shake
    s.screenShake = null;
  } else {
    s.screenShake.intensity *= 0.65;
  }
}
```

And in `renderer.js`, the render function reads `state.screenShake` and applies the offset.

### Phase 5: Room rendering — DEATH_WALL visuals

**File:** `public/src/render/room.js`
**Function:** `renderRoom()` tile rendering switch (~lines 21-60)

**Change:** Add `CELL.DEATH_WALL` rendering case — red/lava visual.

Add after the STONE_WALL case (around line 47):
```js
case CELL.DEATH_WALL:
  // Red/lava glow
  ctx.fillStyle = '#cc3300';
  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
  // Inner highlight
  ctx.fillStyle = '#ff6633';
  ctx.beginPath();
  ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 6, 0, Math.PI * 2);
  ctx.fill();
  // Spiky edges
  ctx.strokeStyle = '#ff4400';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(px + 2, py + 18);
  ctx.lineTo(px + 6, py + 12);
  ctx.lineTo(px + 10, py + 18);
  ctx.lineTo(px + 14, py + 12);
  ctx.lineTo(px + 18, py + 18);
  ctx.stroke();
  break;
```

This creates a red/orange cell with a glowing center and spiky pattern — visually distinct from all existing cell types.

Also, optionally add a subtle pulsing animation by using `state.tickCount` for color variation. Keep it simple for now.

### Phase 6: Generator — Place DEATH_WALL in hazard rooms

**File:** `public/src/engine/generator.js`
**Function:** `generateRoomTiles()` (~lines 197-280)

**Change:** For certain room types or random hazard rooms, replace some interior walls with DEATH_WALL.

Add after the existing wall placement section (~line 215):
```js
  // Add some DEATH_WALL cells in rooms far from start or in hidden rooms
  const distFromStart = Math.abs(room.x - 0) + Math.abs(room.y - 0);
  if (room.type === ROOM_TYPE.HIDDEN || (room.type === ROOM_TYPE.NORMAL && distFromStart >= 4 && rng() < 0.3)) {
    const deathWallCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < deathWallCount; i++) {
      const wx = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      const wy = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      if (tiles[wy][wx] === CELL.FLOOR) {
        // Place a small cluster of DEATH_WALL (only 1 cell for now, can be expanded)
        tiles[wy][wx] = CELL.DEATH_WALL;
        // Verify not completely blocking passage — only place in corners/edges,
        // not in the center path
        if (wx > ROOM_SIZE / 2 - 2 && wx < ROOM_SIZE / 2 + 2 &&
            wy > ROOM_SIZE / 2 - 2 && wy < ROOM_SIZE / 2 + 2) {
          // Don't block center — revert
          tiles[wy][wx] = CELL.FLOOR;
        }
      }
    }
  }
```

**Safety check:** Ensure `DEATH_WALL` is never placed:
- On door positions
- In start/save rooms
- Where it blocks the only passage through a room

### Phase 7: Test updates

**File:** `tests/metroidvania-snake.test.js`

**Test changes needed:**

1. **Update wall collision test** (existing "detects wall collision at room boundary"):
   - Currently expects `'wall'` in result — change to expect `'damage'`

2. **Add new tests:**
   - **Test A: Non-lethal wall damage** — snake hits boundary wall, loses 1 length, game continues
   - **Test B: STONE_WALL damage** — same behavior as WALL
   - **Test C: DEATH_WALL instant death** — snake hits DEATH_WALL, gameState becomes 'gameover'
   - **Test D: Length 0 → gameover** — snake at length 1 hits wall, length becomes 0, gameover
   - **Test E: Screen shake state** — after wall damage, state.screenShake is set
   - **Test F: Wall hit priority** — hitting wall and door simultaneously: wall damage > door transition
   - **Test G: Projectile vs DEATH_WALL** — projectiles hit DEATH_WALL but don't destroy it

---

## 3. Implementation Order

### Step 1: Constants (`constants.js`)
Add `CELL.DEATH_WALL = 5`. Simple, no dependencies.

### Step 2: Collision (`collision.js`)
Change return values. Update `checkSnakeCollision()` and `checkProjectileCollision()`. No state changes.

### Step 3: Core tick (`core.js`)
The main logic change:
- Add `screenShake` to initial state
- Replace `'wall'` branch with `'damage'` handling
- Add `'death'` branch
- Add shake decay
- Handle length-0 guard

### Step 4: Renderer (`renderer.js`)
Add shake transform. Depends on state having `screenShake`.

### Step 5: Room rendering (`room.js`)
Add `DEATH_WALL` visual. Pure render change.

### Step 6: Generator (`generator.js`)
Add `DEATH_WALL` placement. Depends on `constants.js` having the new cell type.

### Step 7: Tests
Update and add tests.

---

## 4. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Existing tests break due to `'wall'` → `'damage'` change | High | Medium | Update test assertions; existing logic is the same, only return value changed |
| Screen shake causes motion sickness | Low | Medium | ±3px max offset, <200ms duration, exponential decay |
| Snake head embeds in wall on damage | Medium | High | Return early from tick before snake movement code |
| DEATH_WALL blocks critical path | Medium | High | Generator safety checks: never in center corridor, never in start/save rooms |
| Frame rate dependent shake | Low | Low | Frame-based counter instead of time-based; acceptable for this game |
| Existing projectile behavior changes | Low | Medium | `checkProjectileCollision` unchanged for WALL/STONE_WALL; DEATH_WALL absorbs projectiles |

---

## 5. Testing Strategy

### Unit Tests (new + modified)

| # | Test Name | Expected | Type |
|---|-----------|----------|------|
| 1 | wall collision returns 'damage' | `['damage']` | Modify existing |
| 2 | boundary wall collision: length-1 | snake length decreases by 1, no gameover | New |
| 3 | indoor wall collision: length-1 | same as above | New |
| 4 | STONE_WALL collision: length-1 | same as above | New |
| 5 | DEATH_WALL collision: gameover | gameState = 'gameover' | New |
| 6 | length=0 after wall damage → gameover | gameState = 'gameover' after second wall hit with length-1 | New |
| 7 | screenShake state set on damage | state.screenShake is non-null | New |
| 8 | DEATH_WALL > door priority | gameover, not room transition | New |
| 9 | projectile vs DEATH_WALL | projectile removed, DEATH_WALL stays | New |

### Integration Tests

None needed beyond existing end-to-end flow tests — the existing test framework validates that the game can be played and won.

### Manual QA

- [ ] Game renders correctly with DEATH_WALL cells visible
- [ ] Screen shake is noticeable but not dizzying
- [ ] Length-1 snake hitting wall correctly triggers gameover
- [ ] DEATH_WALL cells are visually distinct from WALL/STONE_WALL
- [ ] Multiple rapid wall hits don't cause visual jitter accumulation
- [ ] Save/load still works after death by wall

---

## 6. File Change Summary

| File | Change Type | Lines Affected | Complexity |
|------|------------|----------------|------------|
| `public/src/engine/constants.js` | Add constant | +1 line | Trivial |
| `public/src/engine/collision.js` | Modify return values | ~5 lines | Low |
| `public/src/engine/core.js` | Main logic change | ~30 lines | Medium |
| `public/src/render/renderer.js` | Screen shake | ~15 lines | Low |
| `public/src/render/room.js` | DEATH_WALL visual | ~20 lines | Low |
| `public/src/engine/generator.js` | DEATH_WALL placement | ~25 lines | Medium (safety checks) |
| `tests/metroidvania-snake.test.js` | Tests | ~80 lines | Low |

**Total estimated effort:** 1-2 hours

---

## 7. Acceptance Criteria Reference

From the research doc:

1. ✅ Normal wall hit → length-1 + screen shake + game continues
2. ✅ Interior WALL/STONE_WALL hit → same
3. ✅ DEATH_WALL → immediate gameover
4. ✅ Length-0 after wall hit → gameover
5. ✅ Screen shake: ±3px, ~10 ticks, exponential decay (0.65x per tick)
6. ✅ Snake head doesn't embed in wall cell on damage
7. ✅ Damage has priority over food/doors in same tick
8. ✅ DEATH_WALL visually distinct (red/lava/spiky)
9. ✅ Generator never places DEATH_WALL in start/save rooms or blocking passages
