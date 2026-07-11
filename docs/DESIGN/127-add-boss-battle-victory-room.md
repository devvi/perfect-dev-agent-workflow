# Design: #127 — 增加胜利房间的boss战test-v2 (Boss Battle Victory Room)

> Parent Issue: #127
> Agent: plan-agent
> Date: 2026-07-11

---

## 1. Architecture Overview

### Core Idea
Replace the current instant-win GOAL room with a dedicated BOSS room featuring a multi-phase boss fight against "Blue Hammer" (a double-row blue snake). The boss room is 4× larger (80×80 grid), has destructible pillars, a special BOSS door, a boss intro sequence, and a phase-based AI state machine. Food drops get physics bounce and blink-before-despawn mechanics.

### Data Flow
```
Current flow (no boss):
  Enter GOAL room → gameState = 'won' → renderVictoryScreen()

Proposed flow:
  Enter BOSS door → room transition → gameState = 'bossIntro'
    → renderBossIntroOverlay() (letterbox, name, dialog)
    → key press → gameState = 'playing' (in boss room)

  Each tick in boss room:
    1. updateBoss(state) — phase-based AI (Chase/Charge/Normal+Hunt)
    2. checkBossVsPlayerCollision() → damage + food drop with bounce
    3. checkBossVsPillarCollision() → pillar break + food drop
    4. checkProjectileVsBoss() → boss HP reduction
    5. checkFoodConsumed() → boss eats (grow HP) or player eats
    6. updateFoodBlinkDespawn() → blink animation → remove at timer=0
    7. checkBossHP() → phase transitions (6→4→2→0)
    8. boss HP = 0 → death anim → gameState = 'won'
    → renderBossHpBar() in HUD
    → renderRoom() at zoom-out (5px/cell)
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Room type | New `ROOM_TYPE.BOSS` enum | Clean separation from GOAL; generator replaces GOAL with BOSS |
| Room size | 80×80 (BOSS_ROOM_SIZE), rendered at 5px/cell | Approach A from PRD — zoom-out lets player see entire arena; no viewport camera needed |
| Boss entity | `createBossEnemy()` with double-row (6 segments, 2 rows × 3) | Matches issue spec: "双列蛇，总血量6格" |
| Boss AI | Phase state machine in `updateBoss()` | Phase transitions on HP thresholds (6→4→2→0); Phase 4 Hunting overrides all |
| Pillars | 4 destructible STONE_WALL tiles at NE/NW/SE/SW | `breakable: true` property; boss collision triggers break + food drop |
| BOSS door | New `CELL.BOSS_DOOR = 7` | Special visual (red glow/skull icon); locked from outside until boss defeated |
| Food physics | Bounce vector on drop + despawn timer + increasing blink frequency | "食物被弹飞" and "闪烁直到消失" from spec |
| Boss intro | `gameState = 'bossIntro'` with letterbox animation + dialog overlay | Dramatic pause before fight; dismissed by key press |
| Rendering | Zoom-out to 5px/cell for boss room (vs 20px/cell normal) | Simpler than viewport camera; entire arena visible at once |
| Boss HP bar | 6-segment dual-row (3+3) HUD overlay | Only visible in boss room; matches boss visual design |

---

## 2. Engine Layer 变更

### 2.1 `constants.js` — New constants

```js
export const ROOM_TYPE = { NORMAL: 'normal', START: 'start', GOAL: 'goal', BOSS: 'boss', ... };
export const BOSS_ROOM_SIZE = 80;
export const BOSS_CELL_SIZE = 5;
export const CELL = { /* existing */, BOSS_DOOR: 7 };
export const BOSS_CHARGE_WINDUP = 5;    // ticks
export const BOSS_STUFFED_TICKS = 3;
export const FOOD_BLINK_START = 10;      // ticks remaining when blink starts
export const FOOD_DESPAWN_TOTAL = 30;    // total despawn timer
export const BOSS_HP_SEGMENTS = 6;
```

### 2.2 `generator.js` — BOSS room generation

**Change in `assignRoomTypes()`:**
Replace the GOAL room assignment with BOSS room:
```js
// Instead of:
// rooms[maxY][maxX].type = ROOM_TYPE.GOAL;
rooms[maxY][maxX].type = ROOM_TYPE.BOSS;
```

**New function `generateBossRoomTiles(bossRoom)`:**
```js
export function generateBossRoomTiles(room) {
  const tiles = Array.from({ length: BOSS_ROOM_SIZE }, () =>
    Array(BOSS_ROOM_SIZE).fill(CELL.FLOOR)
  );
  // Border walls
  for (let i = 0; i < BOSS_ROOM_SIZE; i++) {
    tiles[0][i] = tiles[BOSS_ROOM_SIZE-1][i] = CELL.WALL;
    tiles[i][0] = tiles[i][BOSS_ROOM_SIZE-1] = CELL.WALL;
  }
  // 4 pillars at room corners (offset from walls)
  const p = 5; // pillar inset from walls
  const pillarPositions = [
    { x: p, y: p },           // NW
    { x: BOSS_ROOM_SIZE - p - 1, y: p },           // NE
    { x: p, y: BOSS_ROOM_SIZE - p - 1 },           // SW
    { x: BOSS_ROOM_SIZE - p - 1, y: BOSS_ROOM_SIZE - p - 1 },  // SE
  ];
  pillarPositions.forEach(pos => {
    tiles[pos.y][pos.x] = CELL.STONE_WALL;  // reuse existing STONE_WALL
  });
  room.pillars = pillarPositions.map(pos => ({ ...pos, hp: 1 }));
  // BOSS door on one wall
  const doorPos = Math.floor(BOSS_ROOM_SIZE / 2);
  tiles[0][doorPos] = CELL.BOSS_DOOR;
  room.bossRoom = true;
  room.bossConfig = { bossType: 'blue_hammer', pillars: pillarPositions };
  return tiles;
}
```

**Update `verifySolvability()`:** Treat BOSS room like GOAL room (endpoint of BFS).

### 2.3 `entities.js` — Boss entity factory

```js
export function createBossEnemy(type, x, y) {
  if (type !== 'blue_hammer') throw new Error(`Unknown boss type: ${type}`);
  return {
    id: 999,  // special boss ID
    type: 'blue_hammer',
    boss: true,
    x, y,  // head position
    hp: 6, maxHp: 6,
    segments: buildBossSegments(x, y),  // 6 cells, 2 rows of 3
    rows: 2, segmentsPerRow: 3,
    speedTicks: 1, tickCounter: 0,
    chaseRange: 200,  // covers whole boss room
    phase: 1,         // 1=Chase, 2=Charge, 3=Normal, 4=Hunting (overrides)
    chargeCooldown: 0,
    stuffedTicks: 0,
    aiState: 'chase', // chase | windup | charge | normal | hunt
    headIndex: 0,      // For Phase 3: which segment is head
    color: '#3060e0',
    headColor: '#5090ff',
  };
}

function buildBossSegments(x, y) {
  // Double row: top row (3 cells), bottom row (3 cells)
  // Head is at (x, y) for both rows
  return [
    // Row 0 (top)
    { x, y },
    { x: x - 1, y },
    { x: x - 2, y },
    // Row 1 (bottom)
    { x, y: y + 1 },
    { x: x - 1, y: y + 1 },
    { x: x - 2, y: y + 1 },
  ];
}
```

### 2.4 `ai.js` — Boss AI state machine

**New function `updateBoss(state)`:**
```js
export function updateBoss(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return state;

  // Phase 4 Hunting: if food exists, override all phases
  if (room.entities.food && room.entities.food.length > 0) {
    return updateBossHunting(state, boss, room);
  }

  switch (boss.phase) {
    case 1: return updateBossChase(state, boss, room);
    case 2: return updateBossCharge(state, boss, room);
    case 3: return updateBossNormalSnake(state, boss, room);
  }
  return state;
}
```

**Phase 1 — Chase (HP 6-4):**
```js
function updateBossChase(state, boss, room) {
  const head = state.snake[0];
  const move = enemyChasePath(boss, head, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    const segments = buildBossSegments(boss.x, boss.y);
    boss.segments = segments;
  }
  // Check phase transition
  if (boss.hp <= 4) {
    boss.phase = 2;
    boss.aiState = 'windup';
    boss.chargeCooldown = BOSS_CHARGE_WINDUP;
  }
  return state;
}
```

**Phase 2 — Charge (HP 4-2):**
```js
function updateBossCharge(state, boss, room) {
  if (boss.aiState === 'windup') {
    boss.chargeCooldown--;
    if (boss.chargeCooldown <= 0) {
      boss.aiState = 'charge';
      // Lock target direction at player's position at windup end
      const head = state.snake[0];
      boss.chargeTarget = { x: head.x, y: head.y };
      boss.chargeDir = normalizeDir(boss, boss.chargeTarget);
    }
    return state;  // No movement during windup
  }

  if (boss.aiState === 'charge') {
    // Rush 2 cells/tick in charge direction
    for (let i = 0; i < 2; i++) {
      boss.x += boss.chargeDir.x;
      boss.y += boss.chargeDir.y;
      // Check wall collision → stop
      const cell = getCellAt(state.world, state.currentRoom, boss.x, boss.y);
      if (cell === CELL.WALL || cell === CELL.STONE_WALL) {
        if (cell === CELL.STONE_WALL) {
          breakPillar(room, boss.x, boss.y);
        }
        boss.aiState = 'chase';
        boss.chargeCooldown = 3;
        break;
      }
    }
    const segments = buildBossSegments(boss.x, boss.y);
    boss.segments = segments;
  }

  if (boss.hp <= 2) {
    boss.phase = 3;
    boss.aiState = 'normal';
    // Shrink to 2 segments
    boss.segments = [segments[0], segments[3]];  // one eye becomes head
    boss.headIndex = 0;
  }
  return state;
}
```

**Phase 3 — Normal Snake (HP 2):**
```js
function updateBossNormalSnake(state, boss, room) {
  const head = state.snake[0];
  const move = enemyChasePath(boss, head, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    boss.segments[0] = { x: boss.x, y: boss.y };
    boss.segments[1] = { x: boss.x - move.x, y: boss.y - move.y };
  }
  return state;
}
```

**Phase 4 — Hunting (overrides all):**
```js
function updateBossHunting(state, boss, room) {
  const nearest = nearestFood(boss, room.entities.food);
  if (!nearest) {
    // No food — delegate to current phase
    return updateBoss(state);
  }
  const move = enemyChasePath(boss, nearest, room, state.world);
  if (move) {
    boss.x += move.x;
    boss.y += move.y;
    if (boss.phase === 3) {
      // In Phase 3, swap headIndex based on proximity
      const dist0 = manhattan(boss.segments[0], nearest);
      const dist1 = manhattan(boss.segments[1], nearest);
      boss.headIndex = dist0 <= dist1 ? 0 : 1;
    }
  }
  return state;
}
```

**Phase transition handler:**
```js
function handlePhaseTransition(boss, state) {
  if (boss.hp > 4 && boss.phase !== 1) boss.phase = 1;
  else if (boss.hp > 2 && boss.hp <= 4 && boss.phase !== 2) boss.phase = 2;
  else if (boss.hp === 2 && boss.phase !== 3) boss.phase = 3;
  else if (boss.hp <= 0) {
    // Boss death
    state.gameState = 'won';
    state.bossDefeated = true;
  }
}
```

### 2.5 `core.js` — Game loop integration

**In `tick()` — boss room entry trigger:**
```js
// After room transition check:
const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
if (room.type === ROOM_TYPE.BOSS && state.gameState !== 'bossIntro' && state.gameState !== 'won') {
  state.gameState = 'bossIntro';
  state.bossIntroData = { bossName: 'Blue Hammer', dialog: 'Snake tasts GOOD !' };
  return state;
}

// Boss intro dismiss (key press):
if (state.gameState === 'bossIntro') {
  // In the input handler: if gameState === 'bossIntro' → set gameState = 'playing'
  return state;
}

// During boss room gameplay:
if (room.type === ROOM_TYPE.BOSS) {
  state = updateBoss(state);
  state = checkBossPlayerCollision(state);
  state = checkBossPillarCollision(state);
  state = updateFoodBlinkDespawn(state);
}
```

**Boss-player collision:**
```js
function checkBossPlayerCollision(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return state;
  const head = state.snake[0];
  const hit = boss.segments.some(seg => seg.x === head.x && seg.y === head.y);
  if (hit && state.invulnerableTicks <= 0) {
    const damage = boss.phase === 2 && boss.aiState === 'charge' ? 2 : 1;
    const lastSeg = state.snake[state.snake.length - 1];
    // Drop food with bounce
    const food = createBounceFood(lastSeg.x, lastSeg.y, boss);
    room.entities.food.push(food);
    // Remove segments
    for (let i = 0; i < damage; i++) {
      if (state.snake.length > 1) state.snake.pop();
    }
    state.invulnerableTicks = INVULNERABILITY_DURATION;
    state.screenShake = { intensity: 6, duration: 10 };
  }
  return state;
}
```

### 2.6 `collision.js` — BOSS door and pillar collision

**BOSS door check (in `checkDoorPassable`):**
```js
if (cell === CELL.BOSS_DOOR) {
  // Player can only leave boss room if boss is defeated
  if (room.bossRoom && !state.bossDefeated) return false;
  return true;  // entering from outside is fine
}
```

**Pillar collision trigger (in `checkSnakeCollision` or `checkBossCollision`):**
```js
if (cell === CELL.STONE_WALL && room.bossRoom && room.pillars) {
  const pillar = room.pillars.find(p => p.x === cx && p.y === cy);
  if (pillar && pillar.hp > 0) {
    // Trigger pillar break
    return { ...result, pillarBreak: true };
  }
}
```

### 2.7 `items.js` — Food blink/despawn + periodic food spawn

**Food with physics bounce:**
```js
export function createBounceFood(x, y, source) {
  const angle = Math.random() * Math.PI * 2;
  const dist = 1 + Math.floor(Math.random() * 3);
  return {
    x, y,
    vx: Math.round(Math.cos(angle) * dist),
    vy: Math.round(Math.sin(angle) * dist),
    isBouncing: true,
    bounceTicks: 3,
    despawnTicks: FOOD_DESPAWN_TOTAL,
    blinkPhase: 0,
  };
}
```

**Update function for food blink/despawn:**
```js
export function updateFoodBlinkDespawn(state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  for (let i = room.entities.food.length - 1; i >= 0; i--) {
    const food = room.entities.food[i];
    if (food.isBouncing && food.bounceTicks > 0) {
      food.x += food.vx;
      food.y += food.vy;
      food.bounceTicks--;
    }
    food.despawnTicks--;
    if (food.despawnTicks <= FOOD_BLINK_START) {
      food.blinkPhase++;
    }
    if (food.despawnTicks <= 0) {
      room.entities.food.splice(i, 1);
    }
  }
  return state;
}
```

**Periodic food spawn (both low HP):**
```js
export function trySpawnPeriodicFood(state, room) {
  const boss = room.entities.enemies.find(e => e.boss);
  const playerLen = state.snake.length;
  if (boss && boss.hp <= 3 && playerLen <= 3 && state.tickCount % 15 === 0) {
    // Spawn food at random floor cell not occupied by entities
    const food = createBounceFood(
      BOSS_ROOM_SIZE / 2 + Math.floor(Math.random() * 10) - 5,
      BOSS_ROOM_SIZE / 2 + Math.floor(Math.random() * 10) - 5,
      null
    );
    room.entities.food.push(food);
  }
}
```

---

## 3. Render Layer 变更

### 3.1 `render/room.js` — Boss room rendering

**Zoom-out rendering for boss room:**
```js
export function renderRoom(ctx, state, room) {
  const cellSize = room.bossRoom ? BOSS_CELL_SIZE : CELL_SIZE;
  const size = room.bossRoom ? BOSS_ROOM_SIZE : ROOM_SIZE;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const cell = room.tiles[y][x];
      const px = x * cellSize;
      const py = y * cellSize;
      // Render cell based on type
      switch (cell) {
        case CELL.FLOOR: ctx.fillStyle = '#1a1a2e'; break;
        case CELL.WALL: ctx.fillStyle = '#0f0f23'; break;
        case CELL.STONE_WALL: ctx.fillStyle = '#555555'; break; // pillar
        case CELL.BOSS_DOOR: ctx.fillStyle = '#aa2222'; break;  // red door
      }
      ctx.fillRect(px, py, cellSize, cellSize);
    }
  }
}
```

**BOSS door rendering (in adjacent room):**
When rendering the adjacent room and its exits, check if the neighboring room is a BOSS room. If so, render the door symbol as red/skull icon.

### 3.2 `render/overlays.js` — Boss intro + victory

**Boss intro overlay:**
```js
export function renderBossIntroOverlay(ctx, state) {
  const { bossName, dialog } = state.bossIntroData;
  const W = 400, H = 400;
  // Letterbox bars
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, W, 60);        // top bar
  ctx.fillRect(0, H - 60, W, 60);   // bottom bar
  // Boss name
  ctx.fillStyle = '#5090ff';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(bossName, W / 2, H / 2 - 30);
  // Dialog
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px monospace';
  ctx.fillText(`"${dialog}"`, W / 2, H / 2 + 10);
  // Press any key prompt
  ctx.fillStyle = '#888888';
  ctx.font = '12px monospace';
  ctx.fillText('Press any key to start', W / 2, H / 2 + 50);
}
```

**Enhanced victory overlay for boss:**
```js
// In renderVictoryScreen, check state.bossDefeated:
if (state.bossDefeated) {
  ctx.fillStyle = '#FFD700';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('⭐ BLUE HAMMER DEFEATED ⭐', W/2, 100);
}
```

### 3.3 `render/hud.js` — Boss HP bar

```js
export function renderBossHpBar(ctx, state) {
  const room = getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y);
  if (!room.bossRoom) return;
  const boss = room.entities.enemies.find(e => e.boss);
  if (!boss) return;
  const segW = 20, segH = 8, gap = 2;
  const startX = 140, startY = 5;
  for (let i = 0; i < BOSS_HP_SEGMENTS; i++) {
    const row = Math.floor(i / 3);
    const col = i % 3;
    const filled = i < boss.hp;
    ctx.fillStyle = filled ? '#3060e0' : '#333344';
    ctx.fillRect(
      startX + col * (segW + gap),
      startY + row * (segH + gap),
      segW, segH
    );
  }
  ctx.fillStyle = '#ffffff';
  ctx.font = '10px monospace';
  ctx.fillText('BOSS', startX - 40, startY + 8);
}
```

---

## 4. Test Plan

### 4.1 Test Structure

Tests follow the existing pattern in `tests/metroidvania-snake.test.js` — each feature area is a `describe` block with `it` test cases. New tests for boss battle will be added as a new `describe` block at the end of the existing test file.

### 4.2 Test Cases

**Phase 1 — Constants & Room Generation:**
1. `ROOM_TYPE.BOSS` enum value exists and equals `'boss'`
2. `BOSS_ROOM_SIZE` equals 80 (4× of `ROOM_SIZE = 20`)
3. Generator creates a BOSS room when `assignRoomTypes()` is called on a 5×5 map
4. BOSS room has `bossRoom: true` flag
5. BOSS room has 4 pillars at expected positions (inset from walls)
6. BOSS door is placed on one wall of boss room

**Phase 2 — Boss Entity:**
7. `createBossEnemy('blue_hammer', x, y)` creates boss with HP=6, 6 segments, 2 rows
8. Boss has correct type, phase=1, aiState='chase'
9. Boss segments form a double-row structure (3 segments per row)

**Phase 3 — Boss AI State Machine:**
10. Phase 1 (Chase): boss moves toward player each tick
11. Phase 2 (Charge): boss transitions to charge when HP ≤ 4
12. Phase 2: boss windup lasts 5 ticks, then charge moves 2 cells/tick
13. Phase 2: boss stops charge on wall collision
14. Phase 3 (Normal): boss shrinks to 2 cells when HP ≤ 2
15. Phase 3: head swaps on player collision
16. Phase 4 (Hunting): boss pathfinds to nearest food when food exists
17. Phase transition at exact HP threshold (no double-transition)
18. Boss regains HP by eating food → transitions back to Phase 2 if HP reaches 4

**Phase 4 — Collision & Pillars:**
19. Boss-player collision: player takes damage (1 segment for phase 1, 2 for phase 2 charge)
20. Boss-pillar collision: pillar breaks, food drops
21. BOSS door is locked from inside until boss defeated
22. BOSS door is passable from outside before boss room
23. Projectile hitting boss: boss HP decreases by 1

**Phase 5 — Food Physics:**
24. Food dropped from damage has bounce properties (vx, vy, isBouncing)
25. Food bounces (moves) for bounceTicks then settles
26. Food blinks when despawnTicks ≤ 10
27. Food is removed when despawnTicks = 0

**Phase 6 — Boss Intro & Victory:**
28. Entering BOSS room sets gameState to 'bossIntro'
29. bossIntroData contains bossName and dialog
30. Key press dismisses boss intro → gameState = 'playing'
31. Boss death at HP=0 → gameState = 'won', bossDefeated = true

**Phase 7 — HUD Rendering:**
32. Boss HP bar renders 6 segments (2 rows × 3)
33. Boss HP bar is only visible when in boss room

**Edge Cases:**
34. Boss charges, misses player → stops at wall, re-evaluates
35. Boss eats food while at max HP → HP stays at 6
36. All pillars destroyed → no re-spawn
37. Both boss and player low HP → periodic food spawn
38. Player length ≤ 1 after boss damage → game over

---

## 5. Boundary Cases

| Case | Expected Behavior |
|------|------------------|
| Player enters boss room → dies | gameState = 'gameover', normal death screen |
| Player enters boss room → defeats boss | Enhanced victory screen with boss name |
| Boss HP exactly at threshold (4 or 2) | Single transition, no double-fire |
| Charge misses player entirely | Boss stops at wall, pauses 2-3 ticks, re-engages |
| Boss eats food at max HP (6) | HP stays 6, "stuffed" pause (3 ticks) |
| All 4 pillars destroyed | Pillars stay broken, no new pillars |
| Food blinks and is about to despawn | Eat succeeds before despawn (tick order: eat > despawn) |
| Boss dies during charge windup (projectile kill) | Death animation immediately, skip charge |
| Boss room on minimap | Special indicator (larger cell / different color) |
| Save before boss room → reload | Player at save point, boss room still unbeaten |
