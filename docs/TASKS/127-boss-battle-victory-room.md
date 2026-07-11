# TASKS: #127 — Boss战代替胜利房间 (Boss Battle Victory Room)

> Parent Issue: #127
> Agent: Hermes Agent (research-agent)
> Date: 2026-07-11
> Estimated Effort: ~16-20 hours total (per Approach A + spike/experiment)

---

## Task Breakdown

### Phase 0: Spike — Viewport / Zoom-Out Rendering Feasibility (2-3h)

- [ ] **T0.1** Create minimal test page rendering 80×80 grid at 5px/cell on 400×400 canvas
- [ ] **T0.2** Evaluate visual legibility: snake head, boss segments, pillars, food at reduced scale
- [ ] **T0.3** Document result — decide: zoom-out (5px/cell) vs viewport scrolling camera
- [ ] **T0.4** Update `docs/DESIGN/127-boss-battle-victory-room.md` with rendering decision

### Phase 1: Constants & Data Structures (1h)

- [ ] **T1.1** Add `ROOM_TYPE.BOSS = 'boss'` to `constants.js`
- [ ] **T1.2** Add `BOSS_ROOM_SIZE = 80` (4× normal), `BOSS_CELL_SIZE = 5` (if zoom-out) or keep `CELL_SIZE` for viewport
- [ ] **T1.3** Add boss-specific timing constants: `BOSS_CHARGE_WINDUP = 5` (ticks), `BOSS_STUFFED_TICKS = 3`, `BOSS_PHASE_HUNT_THRESHOLD = 4`, `FOOD_BLINK_START = 10`, `FOOD_BLINK_TOTAL = 30`
- [ ] **T1.4** Add `CELL.BOSS_DOOR = 7` to constants (special BOSS door type)
- [ ] **T1.5** Update `world.js`: rooms can now have a `bossRoom: true` flag and `bossConfig` object

### Phase 2: Map Generation — Replace GOAL with BOSS Room (2h)

- [ ] **T2.1** In `generator.js` `assignRoomTypes()`: replace `ROOM_TYPE.GOAL` assignment with `ROOM_TYPE.BOSS` assignment (same position)
- [ ] **T2.2** Update `verifySolvability()` (BFS with keys) to treat BOSS room like GOAL room (endpoint)
- [ ] **T2.3** Add `generateBossRoomTiles()`: generate 80×80 tile grid with:
  - Border walls (standard)
  - BOSS door on one wall
  - 4 stone pillars at room corners: pillar positions relative to room-local coords
  - Pillar = `CELL.STONE_WALL` (existing) with `breakable: true` property
- [ ] **T2.4** Connect BOSS room doors: ensure door from prior room connects to BOSS door
- [ ] **T2.5** Add `room.bossRoom = true`, `room.bossConfig = { bossType: 'blue_hammer', pillars: [...] }` on generated room
- [ ] **T2.6** Update `placeEnemiesAndItems()`: skip boss room (boss is placed separately)
- [ ] **T2.7** Update `buildSafeMap()` fallback to also use BOSS room

### Phase 3: Boss Entity Factory (1h)

- [ ] **T3.1** Add `createBossEnemy(type, x, y)` to `entities.js`:
  - `type: 'blue_hammer'`
  - `hp: 6`, `maxHp: 6`
  - `segments`: 6 cells arranged as double row (3 cells per row, head at front of both rows)
  - `rows: 2`, `segmentsPerRow: 3`
  - `speedTicks: 1` (boss moves every tick, faster than normal enemies)
  - `chaseRange: 200` (covers entire 80×80 room)
  - `phase: 1` (starts in chase phase)
  - `chargeCooldown: 0`
  - `stuffedTicks: 0`
  - `aiState: 'chase'`
  - `headIndex: 0` (which eye is current head in Phase 3)
  - `color: '#3060e0'` (blue palette)

### Phase 4: Boss AI State Machine (4h)

- [ ] **T4.1** Add `updateBoss(state)` to `ai.js`:
  - **Entry point**: Find boss entity in current room, dispatch to phase handler
  - **Run after** normal enemy updates (boss is separate entity)
- [ ] **T4.2** Implement Phase 1 — Chase (`HP 6-4`):
  - Extend existing `enemyChasePath()` with `isBoss: true` (ignores chase range limit)
  - On collision with player: deal 1-segment damage, drop food with bounce vector
  - Boss collision with pillar: pillar HP-- (tracked on room.pillar HP)
  - When pillar HP = 0 → pillar breaks → cell becomes FLOOR → food drops with bounce
- [ ] **T4.3** Implement Phase 2 — Charge (`HP 4-2`):
  - Stop movement → set `aiState = 'windup'` for 5 ticks (with visual shake)
  - After windup: `aiState = 'charge'`, rush in straight line toward player's position at windup start
  - Speed = 2 cells/tick during charge
  - On player collision: 2-segment damage, double food drop
  - On wall collision: stop charge, 2-tick pause, then re-evaluate
  - On pillar collision: pillar break + food drop + stop charge
  - After charge resolves: `chargeCooldown = 8`, loop back to windup
- [ ] **T4.4** Implement Phase 3 — Normal Snake (`HP 2`):
  - Boss "splits" — two remaining cells become head + tail
  - `headIndex` determines which eye is head (0 = first, 1 = second)
  - Movement: standard `enemyChasePath()` (like normal enemy but faster)
  - On player collision: 1-segment damage → swap `headIndex` (turn around)
  - Boss body = 2 cells (segments[0] = head, segments[1] = tail)
- [ ] **T4.5** Implement Phase 4 — Hunting (overrides all phases):
  - Check: if room has any food, override current phase target with nearest food
  - In Phase 3: choose `headIndex` based on which head is closer to the target food
  - On food consumption: HP+1, segments update
  - If HP > 6: set `stuffedTicks = 3` (boss pauses)
  - If HP reaches 4 (by eating food): transition back to Phase 2 (Charge)
- [ ] **T4.6** Phase transition handler:
  - When HP crosses threshold (4 or 2): trigger transition
  - Visual: screen shake + color flash on transition
  - Phase 1→2: boss color shifts, charge windup starts immediately
  - Phase 2→3: boss shrinks to 2 cells, eyes remain
- [ ] **T4.7** Boss death: when HP = 0:
  - Death animation (fade out, 5 ticks)
  - Remove boss from room entities
  - Set `gameState = 'won'`
- [ ] **T4.8** Boss eating food: reuse `tryStealFood()` pattern but extend:
  - Boss steals food when on same cell
  - HP capped at `maxHp = 6`

### Phase 5: Boss Room Rendering (2h)

- [ ] **T5.1** In `render/room.js` `renderRoom()`:
  - Detect boss room: use cell size override if `room.bossRoom`
  - If zoom-out: render at `BOSS_CELL_SIZE = 5` (instead of `CELL_SIZE = 20`)
  - If viewport: apply camera offset centered on snake head
- [ ] **T5.2** Render pillars: `CELL.STONE_WALL` with extra visual indicator (cracked stone appearance)
  - When pillar HP < 100%: show crack patterns
  - When pillar HP = 0: show FLOOR (pillar gone)
- [ ] **T5.3** BOSS door rendering: special indicator (e.g., red glow, skull icon, different arrow color)
  - In room map: show BOSS icon on door position in adjacent room
  - BOSS door uses `CELL.BOSS_DOOR` → render with red tint and special symbol
- [ ] **T5.4** Render boss entity:
  - Blue double-row: two parallel rows of 3 cells each
  - Head segments have eyes rendered on them
  - Different color: `#3060e0` with lighter head `#5090ff`
  - Phase indicator: charge windup → shake animation
  - HP indicator: show remaining HP as heart/squares above boss
- [ ] **T5.5** Boss HP bar in HUD (`render/hud.js`):
  - When in boss room: show 6-segment dual-row health bar at top of screen
  - Each segment represents 1 HP
  - Filled = blue (current), empty = dark gray (lost)
  - Dual-row visual: 3 segments top row, 3 segments bottom row

### Phase 6: Boss Intro & Victory Overlays (1.5h)

- [ ] **T6.1** Add `'bossIntro'` to game state types in `core.js`
- [ ] **T6.2** In `core.js` `tick()`: on room transition to BOSS room:
  - Set `gameState = 'bossIntro'`
  - Set `bossIntroData = { bossName: 'Blue Hammer', dialog: 'Snake tasts GOOD !' }`
  - Return early (no tick for boss room until intro dismissed)
- [ ] **T6.3** In `render/overlays.js`, add `renderBossIntroOverlay(ctx, state)`:
  - Letterbox bars: black rectangles at top and bottom (animate in from edges)
  - Center: boss name "Blue Hammer" in large blue text
  - Below: dialog "Snake tasts GOOD !" in white text
  - Dramatic pause (2-3 seconds auto-advance or key press)
  - On dismiss: `gameState = 'playing'`, boss room active
- [ ] **T6.4** Enhanced victory overlay `renderVictoryScreen(ctx, state)`:
  - When boss defeated: show "⭐ BLUE HAMMER DEFEATED ⭐" gold text
  - Show boss-specific stats: boss HP, hits taken, etc.
  - Standard stats: score, length, rooms explored, enemies killed

### Phase 7: Food Physics & Blink/Despawn (2h)

- [ ] **T7.1** Extend food item to include optional physics properties:
  ```js
  { x, y, vx: 0, vy: 0, isBouncing: false, despawnTicks: 30, blinkPhase: 0 }
  ```
- [ ] **T7.2** On food drop from damage:
  - Calculate bounce vector: random direction from collision point, distance 1-3 cells
  - Set `vx`, `vy` to bounce direction
  - `isBouncing = true`
  - Over next 2-3 ticks, move food along bounce vector, then settle at final position
- [ ] **T7.3** Track per-food `despawnTicks`:
  - Decrement each tick
  - When `despawnTicks <= 10`: start blink animation (toggle alpha every 2 ticks)
  - When `despawnTicks <= 5`: blink every tick (increasing frequency)
  - When `despawnTicks = 0`: remove food from room
- [ ] **T7.4** Apply to all food drops: enemy attack (existing from #118), wall collision, boss damage, pillar break
- [ ] **T7.5** In `render/room.js`: render food with alpha oscillation when blinking

### Phase 8: Core Game Loop Integration (1.5h)

- [ ] **T8.1** In `core.js` `tick()`:
  - After room transition check: if new room is BOSS type → enter `bossIntro` state (skip normal tick)
  - After intro dismissed: set `gameState = 'playing'`
  - During boss room: call `updateBoss(state)` instead of (or in addition to) `updateEnemies()`
  - Handle boss collision with player (delegates to existing enemy collision logic + special boss damage amounts)
  - Handle boss collision with pillars (pillar break → food drop)
  - Handle food blink/despawn timer in `tick()`
  - Handle periodic food spawn: check if both low HP, spawn food every N ticks
  - Handle boss death: transition to `gameState = 'won'`
- [ ] **T8.2** Add `enterKeyToContinue()` for boss intro dismissal (key press → gameState = 'playing')
- [ ] **T8.3** Ensure save points work before boss room (player can save before boss)

### Phase 9: Collision Detection Updates (1h)

- [ ] **T9.1** In `collision.js` `checkSnakeCollision()`:
  - Add `CELL.BOSS_DOOR` → return `['boss_door']` collision type (triggers boss room transition)
  - Detect pillar collision: when head hits `CELL.STONE_WALL` in boss room → trigger pillar break
- [ ] **T9.2** Add `checkBossCollision()`:
  - Separate from regular enemy collision due to double-row structure
  - Check collision with any of boss's 6 segments
  - Return collision severity (1-segment damage for body, 2-segment for charge)
- [ ] **T9.3** Update projectile collision for boss:
  - Projectile hitting boss → boss HP-1
  - Boss can survive projectile (not insta-killed)
  - Track which row/segment takes damage

### Phase 10: Testing (2h)

- [ ] **T10.1** Write test: generator creates BOSS room at far corner (reachable from start)
- [ ] **T10.2** Write test: BOSS door visual only appears on boss room entrance
- [ ] **T10.3** Write test: boss entity created with correct HP (6), segments (6), rows (2)
- [ ] **T10.4** Write test: Phase 1 (Chase) — boss moves toward player each tick
- [ ] **T10.5** Write test: Phase 2 (Charge) — boss charges after wind-up; stops on wall hit
- [ ] **T10.6** Write test: Phase 3 (Normal Snake) — boss shrinks to 2 cells; head swaps on hit
- [ ] **T10.7** Write test: Phase 4 (Hunting) — boss pathfinds to food when available
- [ ] **T10.8** Write test: Phase transition at HP 4 (Phase 1→2) and HP 2 (Phase 2→3)
- [ ] **T10.9** Write test: HP 4 regain via food → transition back to Phase 2
- [ ] **T10.10** Write test: Pillar collision → pillar breaks → food appears
- [ ] **T10.11** Write test: Boss death at HP=0 → gameState='won'
- [ ] **T10.12** Write test: Food blink timer — food removed after despawnTicks reach 0
- [ ] **T10.13** Write test: Boss intro state — game paused, dialog shows
- [ ] **T10.14** Write test: Boss HP bar renders correctly (6 segments)
- [ ] **T10.15** Write test: Player can't leave boss room (BOSS door locked from inside)

---

## Execution Order

```
Phase 0 (Spike)
  │
  ▼
Phase 1 (Constants) ──► Phase 2 (Generator) ──► Phase 3 (Entity)
                                        │               │
                                        ▼               ▼
                                  Phase 5 (Render) ── Phase 4 (AI)
                                        │               │
                                        ▼               ▼
                                  Phase 6 (Overlay)   Phase 7 (Food)
                                        │               │
                                        └───────┬───────┘
                                                ▼
                                          Phase 8 (Core)
                                                │
                                          Phase 9 (Collision)
                                                │
                                          Phase 10 (Tests)
```

Phase 0 must execute first (rendering decision affects all downstream code).
Phases 2, 3, 5 are independent of each other after Phase 1.
Phase 4 (AI) needs Phase 3 (entity).
Phase 6 (overlays) needs Phase 5 (rendering).
Phase 8 (core loop) integrates everything.
Phase 9 (collision) updates are lightweight and can happen in parallel with Phase 8.
Phase 10 (tests) runs last as acceptance verification.
