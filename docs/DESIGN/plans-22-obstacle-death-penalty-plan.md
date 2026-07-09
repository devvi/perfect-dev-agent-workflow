# Design: #22 — 关卡障碍死亡惩罚迭代 (Obstacle Death Penalty — Detailed)

> Parent Issue: #22
> Agent: plan-agent
> Date: 2026-07-07

---

## 1. Architecture Overview

将现有"撞墙即死"机制升级为三层惩罚体系，并新增屏幕震动反馈。

### Design Decisions

**采用 Approach A（最小改动）**：不引入数值化伤害系统，仅修改碰撞返回值和处理分支。
- 改动 5-6 个文件，预计开发时间 < 2 小时
- 未来可平滑升级到伤害数值化（将 `'damage'` 改为 `{ type: 'damage', amount: 1 }`）
- 与现有数据流（tick → collision → state update → render）完全兼容

---

## 2. Detailed Design

### 2.1 Phase 1: Constants — Add DEATH_WALL cell type

**File:** `public/src/engine/constants.js`
```diff
export const CELL = {
  FLOOR:        0,
  WALL:         1,
  CRACKED_WALL: 2,
  DOOR:         3,
  STONE_WALL:   4,
+ DEATH_WALL:  5,
};
```

### 2.2 Phase 2: Collision — Differentiate wall types

**File:** `public/src/engine/collision.js`, function: `checkSnakeCollision()`

```diff
  if (cellType === CELL.WALL || cellType === CELL.STONE_WALL) {
-   return ['wall'];
+   return ['damage'];
+ }
+ if (cellType === CELL.DEATH_WALL) {
+   return ['death'];
  }
```

Also update `checkProjectileCollision()`: projectiles should still hit/dissipate on WALL/STONE_WALL, but NOT on DEATH_WALL (projectiles should pass through or be absorbed, not destroy).

### 2.3 Phase 3: Core tick — Add damage/death handling

**File:** `public/src/engine/core.js`, function: `tick()`

**Replace:**
```js
  if (collisions.includes('wall')) {
    s.gameState = 'gameover';
    return s;
  }
```

**With:**
```js
  if (collisions.includes('damage')) {
    s.snake = s.snake.slice(0, -1);
    s.score = Math.max(0, s.score - 5);
    s.screenShake = { intensity: 3, duration: 300, tickCounter: 0 };

    if (s.snake.length === 0) {
      s.gameState = 'gameover';
      return s;
    }
    return s; // skip food, door transition, enemy processing
  }

  if (collisions.includes('death')) {
    s.gameState = 'gameover';
    return s;
  }
```

**Also in core.js:** Add `screenShake` initialization to `createInitialState()`:
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

**Screen shake decay logic** (in `tick()`, after all updates):
```js
  if (s.screenShake) {
    s.screenShake.frameCounter++;
    if (s.screenShake.frameCounter >= 10) {
      s.screenShake = null;
    } else {
      s.screenShake.intensity *= 0.65;
    }
  }
```

### 2.4 Phase 4: Rendering — Screen shake

**File:** `public/src/render/renderer.js`, function: `render()`

```js
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.save();
  if (state.screenShake) {
    const intensity = state.screenShake.intensity;
    const offsetX = Math.round((Math.random() - 0.5) * 2 * intensity);
    const offsetY = Math.round((Math.random() - 0.5) * 2 * intensity);
    ctx.translate(offsetX, offsetY);
  }

  renderRoom(ctx, state, world);
  renderHUD(ctx, state);
  renderMinimap(ctx, state, world);
  renderOverlay(ctx, state);
  renderScanlines(ctx);

  ctx.restore();
}
```

### 2.5 Phase 5: Room rendering — DEATH_WALL visuals

**File:** `public/src/render/room.js`

Add after the STONE_WALL case:
```js
case CELL.DEATH_WALL:
  ctx.fillStyle = '#cc3300';
  ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
  ctx.fillStyle = '#ff6633';
  ctx.beginPath();
  ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 6, 0, Math.PI * 2);
  ctx.fill();
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

### 2.6 Phase 6: Generator — Place DEATH_WALL in hazard rooms

**File:** `public/src/engine/generator.js`, function: `generateRoomTiles()`

```js
  const distFromStart = Math.abs(room.x - 0) + Math.abs(room.y - 0);
  if (room.type === ROOM_TYPE.HIDDEN || (room.type === ROOM_TYPE.NORMAL && distFromStart >= 4 && rng() < 0.3)) {
    const deathWallCount = 1 + Math.floor(rng() * 3);
    for (let i = 0; i < deathWallCount; i++) {
      const wx = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      const wy = 2 + Math.floor(rng() * (ROOM_SIZE - 4));
      if (tiles[wy][wx] === CELL.FLOOR) {
        tiles[wy][wx] = CELL.DEATH_WALL;
        if (wx > ROOM_SIZE / 2 - 2 && wx < ROOM_SIZE / 2 + 2 &&
            wy > ROOM_SIZE / 2 - 2 && wy < ROOM_SIZE / 2 + 2) {
          tiles[wy][wx] = CELL.FLOOR; // Don't block center
        }
      }
    }
  }
```

**Safety check:** Ensure `DEATH_WALL` is never placed on door positions, start/save rooms, or blocking the only passage.

### 2.7 Phase 7: Test updates

**File:** `tests/metroidvania-snake.test.js`

1. **Update wall collision test** — expect `'damage'` instead of `'wall'`
2. **New tests:**
   - A: Non-lethal wall damage — snake hits wall, loses 1 length, game continues
   - B: STONE_WALL — same behavior
   - C: DEATH_WALL — gameover
   - D: Length 0 → gameover
   - E: Screen shake state set
   - F: Wall hit priority over door
   - G: Projectile vs DEATH_WALL

### 2.8 Implementation Order

1. Constants (constants.js)
2. Collision (collision.js)
3. Core tick (core.js)
4. Renderer (renderer.js)
5. Room rendering (room.js)
6. Generator (generator.js)
7. Tests

### 2.9 Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Existing tests break due to `'wall'` → `'damage'` | High | Medium | Update test assertions |
| Screen shake causes motion sickness | Low | Medium | ±3px max offset, <200ms duration |
| Snake head embeds in wall on damage | Medium | High | Return early before snake movement code |
| DEATH_WALL blocks critical path | Medium | High | Generator safety checks |
| Frame rate dependent shake | Low | Low | Frame-based counter instead of time-based |

---

## 3. Files Changed

| File | Change Type | Lines Affected | Complexity |
|------|------------|----------------|------------|
| `public/src/engine/constants.js` | Add constant | +1 | Trivial |
| `public/src/engine/collision.js` | Modify return values | ~5 | Low |
| `public/src/engine/core.js` | Main logic change | ~30 | Medium |
| `public/src/render/renderer.js` | Screen shake | ~15 | Low |
| `public/src/render/room.js` | DEATH_WALL visual | ~20 | Low |
| `public/src/engine/generator.js` | DEATH_WALL placement | ~25 | Medium |
| `tests/metroidvania-snake.test.js` | Tests | ~80 | Low |

**Total estimated effort:** 1-2 hours

---

## 4. Verification Checklist

- [ ] Normal wall hit → length-1 + screen shake + game continues
- [ ] Interior WALL/STONE_WALL hit → same as above
- [ ] DEATH_WALL → immediate gameover
- [ ] Length-0 after wall hit → gameover
- [ ] Screen shake: ±3px, ~10 ticks, exponential decay (0.65x per tick)
- [ ] Snake head doesn't embed in wall cell on damage
- [ ] Damage has priority over food/doors in same tick
- [ ] DEATH_WALL visually distinct (red/lava/spiky)
- [ ] Generator never places DEATH_WALL in start/save rooms or blocking passages
- [ ] Projectile vs DEATH_WALL — projectile removed, DEATH_WALL stays
- [ ] Game renders correctly with DEATH_WALL cells visible
- [ ] Multiple rapid wall hits don't cause visual jitter accumulation
- [ ] Save/load still works after death by wall
- [ ] `npm test` all tests pass
