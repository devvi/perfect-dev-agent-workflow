# Design: #122 — 增加胜利房间的boss战 (Boss Battle in Victory Room)

> Parent Issue: #122
> Agent: plan-agent
> Date: 2026-07-11

---

## 1. Architecture Overview

### Core Idea
Replace the instant-win GOAL room with a BOSS room placed adjacent to the GOAL. The BOSS room features a dual-column snake boss "Blue Hammer" (6 HP, 4 behavior modes, phase-based AI), 4 destructible pillars, a cinematic intro sequence, and a food-drop-with-decay mechanic. Only after defeating the boss does the GOAL room become accessible and trigger the victory screen.

### Data Flow
```
World Generation (generator.js)
  │
  ├── assignRoomTypes()
  │     └── BOSS room placed on shortest path adjacent to GOAL
  │     └── ROOM_TYPE.BOSS added to room type enum
  │
  ├── generateRoomTiles()
  │     └── BOSS room: 4 pillars at NE/NW/SE/SW (CELL.BOSS_PILLAR)
  │     └── Special boss door type on entry wall
  │
  └── placesEnemiesAndItems()
        └── No regular enemies in BOSS room
        └── Boss entity spawned on room entry

Game Loop (core.js tick())
  │
  ├── Room type check
  │     ├── ROOM_TYPE.GOAL → if state.bossDefeated=true → 'won'
  │     │                     else → blocked (boss not defeated)
  │     └── ROOM_TYPE.BOSS → bossFight state machine
  │
  ├── Boss State Machine (state.bossFight)
  │     ├── 'intro' → cinematic (letterbox, name, dialogue) → 'active'
  │     ├── 'active' → boss AI tick, collision, combat → 'defeated' or 'dead'
  │     └── 'defeated' → unlock GOAL, play boss victory → 'won'
  │
  ├── Boss AI (ai.js)
  │     ├── getBossBehavior(boss, state) →
  │     │     ├── foodOnField? → FOOD_PRIORITY (overrides all)
  │     │     ├── boss.hp ≤ 2 → SINGLE_SNAKE_MODE
  │     │     ├── boss.hp ≤ 4 → CHARGE_MODE
  │     │     └── else → CHASE_MODE
  │     └── updateBoss() per-tick movement
  │
  ├── Collision (collision.js)
  │     ├── checkBossCollision() → player ↔ boss body
  │     ├── checkPillarCollision() → player/boss ↔ BOSS_PILLAR
  │     │     ├── Player: damage (not death) + food drop with physics
  │     │     └── Boss: pillar destroyed (cell → FLOOR)
  │     └── checkFoodDecay() → flash timer per food item
  │
  └── Combat (combat.js)
        ├── applyBossDamage() → remove tail segment, drop food with bounce
        └── bossDeath() → set bossDefeated=true, bossFight='defeated'

Render Pipeline
  ├── room.js: Render BOSS_PILLAR cells, boss entity (dual-column blue), boss door
  ├── overlays.js: Boss intro cinematic, boss victory screen variant
  ├── hud.js: Boss HP bar (shown only in BOSS room)
  └── renderer.js: Screen-shake on charge, letterbox effect, food flash animation
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Room type | New `ROOM_TYPE.BOSS` (Approach A from PRD) | Clean separation from GOAL; distinct door/minimap rendering; extensible for future bosses |
| Boss entity structure | Single entity with dual segment arrays `segments1[]` + `segments2[]` | Independent entity lifecycle; both columns share same AI state; verified feasible in spike |
| Boss AI system | New `bossAI` module (not part of enemy AI) | Boss behavior (phases, charge, food priority) diverges significantly from patrol enemy AI; separate module is cleaner |
| Pillar collision | Player: damage (HP loss + food drop, no death); Boss: pillar destroyed | Player punishment without softlock; boss dynamic environment interaction |
| Food decay | Timer + flash animation on all dropped food (from any damage source) | Universal mechanic: player damage, boss damage, or wall collision all trigger decaying food drops |
| Boss door type | New enum in DOOR_TYPE | Special visual rendering; lockable on entry; distinguishable on minimap |

---

## 2. Engine Layer 变更

### State Additions

```js
// Added to game state in core.js
{
  bossFight: {
    phase: 'intro',       // 'intro' | 'active' | 'defeated'
    introTick: 0,         // ticks elapsed since boss room entry
    boss: null,           // boss entity (created on intro complete)
  },
  bossDefeated: false,    // global flag: GOAL room only works if true
  foods: [],              // enhanced food array: { x, y, decayTimer, flashRate, bounceVx, bounceVy }
}
```

### Game Loop Changes (`core.js`)

- **`tick()` line ~98**: Replace unconditional GOAL→'won' with conditional:
  ```js
  if (room.type === ROOM_TYPE.GOAL && state.bossDefeated) {
    gameState = 'won';
  }
  ```
- **`tick()` after room transition**: Add `enterBossRoom(state)` handler that:
  1. Sets `state.bossFight.phase = 'intro'`
  2. Creates boss entity via `createBoss()`
  3. Sets `state.bossDefeated = false`
  4. Locks boss door
- **`tick()` main loop**: Add `updateBoss(state)` call between enemy/combat updates
- **`tick()` loop — boss intro handling**: Pause game during intro ticks (no player input, no enemy movement)
- **`tick()` GOAL room detection (~line 188)**: Add bossDefeated check before setting 'won'

### AI / Behavior (`ai.js`)

New functions (boss AI is a separate concern, can be in a new `bossAI.js` or extended in `ai.js` — decision: new `bossAI.js` for modularity):

```js
// New file: public/src/engine/bossAI.js

// Phase resolution — called every tick
export function resolveBossPhase(boss, state) {
  // Priority cascade:
  if (hasFoodOnField(state)) return 'FOOD_PRIORITY';
  if (boss.hp <= 2)           return 'SINGLE_SNAKE';
  if (boss.hp <= 4)           return 'CHARGE';
  return 'CHASE';
}

// Mode 1: Chase — pathfind toward player
export function bossChase(boss, playerPos, state) { ... }

// Mode 2: Charge — wind up, then dash toward player's last known direction
export function bossCharge(boss, playerPos, tickCount) {
  // Phase A (ticks 1-5): Wind up — boss slows, visual cue (screen tint)
  // Phase B (ticks 6-10): Dash — boss moves 2 cells/tick toward player direction
  // Phase C (ticks 11+): Recovery — boss slows, back to chase
}

// Mode 3: Single snake — one head active, alternate on player hit
export function bossSingleSnake(boss, playerPos, state) {
  // Uses whichever head is 'active' (state.boss.activeHead: 'head1' | 'head2')
  // On player collision: swap activeHead, lose player segment
}

// Mode 4: Food priority — pathfind to nearest food
export function bossSeekFood(boss, foods, state) {
  const nearest = findNearest(boss.headPosition(), foods);
  // If boss length > maxLen (6): enter 'stuffed' state for N ticks
}
```

**Charge attack cycle:** `windUp(5 ticks) → dash(5 ticks, 2× speed) → recover(3 ticks) → repeat`

In single-snake mode with food priority: boss switches to the head closer to food before pathfinding.

### Collision / Combat (`collision.js`, `combat.js`)

New collision types:

- **Boss-player collision**: `'bossDamage'` — player loses segments (2 in charge mode, 1 otherwise), food drops with bounce
- **Boss-pillar collision**: `'pillarDestroy'` — pillar cell becomes FLOOR, no damage to boss
- **Player-pillar collision**: `'pillarDamage'` — player loses 1 segment + food drop, NOT death (unless snake length = 0)
- **Food decay timer**: Each food object gets `decayTimer: 120` (ticks), `flashStart: 80` (start flashing at 80 remaining), flash rate increases as timer → 0

New combat functions:

```js
// In combat.js — applyBossDamage(boss, side: 'col1'|'col2')
// Remove tail of specified column, drop food at that position with bounce
export function applyBossDamage(boss, column) {
  const tail = boss[column].pop();
  if (boss[column].length === 0) {
    // Column destroyed — boss loses 1 HP
    boss.hp -= 1;
    boss.colHp -= 1;
    // If hp reaches 0, boss is defeated
  }
  spawnFoodWithPhysics(tail.x, tail.y);
}

// Boss death sequence
export function bossDeath(boss, state) {
  state.bossDefeated = true;
  state.bossFight.phase = 'defeated';
  // Unlock boss door, allow exit to GOAL
  // Boss victory screen triggers on next room transition to GOAL
}
```

---

## 3. Entity Layer 变更

### New Entity Types

```js
// Boss entity structure (in entities.js)
export function createBoss(startX, startY) {
  // Dual-column snake: two parallel columns, 1 cell gap
  // Head at startX, startY — col1 offset (0,0), col2 offset (1,0)
  return {
    type: 'boss',
    name: 'Blue Hammer',
    hp: 6,                    // total HP
    colHp: 3,                 // HP per column
    segments1: [              // left column (head to tail)
      { x: startX, y: startY },
      { x: startX - 1, y: startY },
      { x: startX - 2, y: startY },
    ],
    segments2: [              // right column (head to tail)
      { x: startX, y: startY + 1 },
      { x: startX - 1, y: startY + 1 },
      { x: startX - 2, y: startY + 1 },
    ],
    direction: { x: -1, y: 0 },  // current movement direction
    behavior: 'CHASE',          // current AI mode
    behaviorTick: 0,            // ticks in current behavior
    stuffedTicks: 0,            // remaining stuffed (immobile) ticks
    color: '#4488FF',           // blue
    eyes: [
      { segmentIdx: 0, column: 'segments1' },
      { segmentIdx: 0, column: 'segments2' },
    ],
    activeHead: 'head1',        // which head is active in single-snake mode
  };
}
```

### Existing Entity Modifications

- **Food entity**: Add fields `decayTimer`, `flashRate`, `bounceVx`, `bounceVy` for decay mechanic and physics bounce
- **Create `spawnFoodWithPhysics(x, y)`**: Spawn food at position with small random velocity, bounces off walls for a few ticks before settling
- **No changes to regular enemy or snake entities**

### World / Map Changes

- `generator.js` — `assignRoomTypes()`: After placing GOAL, find nearest path room adjacent to GOAL and assign `ROOM_TYPE.BOSS`
- `generator.js` — `generateRoomTiles()`: For BOSS rooms, place 4 pillars at fixed positions:
  - NE: (15, 3), NW: (3, 3), SE: (15, 15), SW: (3, 15)  (in 20×20 grid)
  - Pillars use `CELL.BOSS_PILLAR` — renders as indestructible-looking wall (but destructible by boss)
- `world.js`: Add door type field to room/transition data: `DOOR_TYPE.NORMAL | DOOR_TYPE.BOSS`

---

## 4. Data Layer 变更

### New Constants (`constants.js`)

```js
export const ROOM_TYPE = {
  // ... existing types
  BOSS: 'boss',           // Boss encounter room
};

export const CELL = {
  // ... existing cell types
  BOSS_PILLAR: 'B',       // Boss room pillar (destructible, causes damage to player)
};

export const DOOR_TYPE = {
  NORMAL: 'normal',
  BOSS: 'boss',           // Special boss door — distinct visual, locks on entry
};

export const BOSS = {
  NAME: 'Blue Hammer',
  MAX_HP: 6,
  COL_HP: 3,              // HP per column
  MAX_LENGTH_PER_COL: 3,  // Starting length per column
  CHARGE_WINDUP_TICKS: 5,
  CHARGE_DASH_TICKS: 5,
  CHARGE_RECOVERY_TICKS: 3,
  STUFFED_TICKS: 10,      // Ticks boss is immobile after eating past max
  FOOD_DECAY_TICKS: 120,  // Total ticks before food disappears
  FOOD_FLASH_START: 80,   // Tick when flashing begins (80 remaining)
};

export const PILLAR_POSITIONS = [
  { cx: 3, cy: 3 },    // NW
  { cx: 15, cy: 3 },   // NE
  { cx: 3, cy: 15 },   // SW
  { cx: 15, cy: 15 },  // SE
];
```

### Palette Additions

```js
PALETTE.BOSS_BLUE = '#4488FF';           // Boss snake body
PALETTE.BOSS_EYE = '#FF4444';            // Boss eyes (red)
PALETTE.BOSS_PILLAR = '#888888';         // Pillar visual
PALETTE.BOSS_DOOR = '#FF0000';           // Boss door indicator
PALETTE.BOSS_HP_BAR = '#4488FF';         // Boss HP bar fill
PALETTE.BOSS_HP_BG = '#333333';          // Boss HP bar background
```

### Save Data Changes

- Boss state is NOT saved mid-fight — on save/load, boss fight resets if player is in BOSS room
- `state.bossDefeated` IS saved as a boolean with other game state
- GOAL room access persists across save/load once boss is defeated

---

## 5. Render Layer 变更

### New Visual Elements

- **Boss door** (`room.js`): Render door with red glow/BOSS icon on minimap and in-room. Door type `DOOR_TYPE.BOSS` triggers special render case.
- **Boss entity** (`room.js`): Render two parallel blue snake columns with gap. Two red eye circles on front segments. Boss turns darker as HP decreases.
- **Pillars** (`room.js`): Render CELL.BOSS_PILLAR as textured wall blocks (looks like stone/iron). On destruction, render FLOOR underneath.
- **Food physics bounce**: Food items with `bounceVx/bounceVy` bounce off walls for first 5 ticks, then settle. Rendered with motion blur (trail effect).

### HUD / Overlay Changes

- **Boss HP bar** (`hud.js`): Shown when `room.type === ROOM_TYPE.BOSS && bossFight.phase === 'active'`. Horizontal bar at top of screen, labeled "Blue Hammer". 6 segments representing 6 HP. Each HP lost grays out one segment.
- **Boss intro cinematic** (`overlays.js`):
  1. Letterbox bars animate in (top/bottom black bars)
  2. "Blue Hammer" text appears, scale-up animation
  3. Dialogue box: "Snake tasts GOOD !" with typewriter effect
  4. Boss roar flash effect (screen briefly flashes)
  5. Bars animate out → game begins
- **Boss victory screen** (`overlays.js`): Variant of victory screen that acknowledges boss defeat ("Victory! Blue Hammer defeated")

### Animation / Effects

- **Screen-shake** (`renderer.js`): Triggered during boss charge dash (ticks 5-9 of charge cycle). Offset canvas rendering by random ±2-4px each frame.
- **Letterbox effect** (`renderer.js`): During boss intro, render black bars at top/bottom of screen covering ~20% each.
- **Food flash animation**: Food with `decayTimer < FOOD_FLASH_START` alternates visibility (hidden/visible) every N ticks, rate increases as timer decreases.
- **Pillar destruction animation**: CELL.BOSS_PILLAR → 2-frame crack animation → CELL.FLOOR.

---

## 6. Input / UI Layer 变更

### New Controls

- No new controls needed during boss fight (existing movement + firing works)
- During boss intro cinematic: all controls disabled (game paused)
- After boss death: GOAL room entry re-enabled

### UI Changes

- **Boss HP bar**: New HUD element (see Render Layer)
- **Boss room minimap icon**: BOSS room shows a special icon (skull or crossbones) on minimap
- **Boss door indicator**: When approaching boss room, door icon pulses subtly to warn player
- **Pause menu in boss room**: Pause still works; no save allowed during boss fight

---

## 7. Test Layer 变更

### Test Structure

| # | Test File | Focus |
|---|-----------|-------|
| 1 | `tests/boss-battle.test.js` (new) | All boss battle scenarios |

### Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| Boss entity creation | ✅ | ≥3 | ✅ |
| Boss behavior modes | ✅ (all 4 modes) | ≥3 | ✅ |
| Pillar interaction | ✅ | ≥2 | ✅ |
| Food decay mechanic | ✅ | ≥2 | ✅ |
| Cinematic intro | ✅ | ≥1 | ✅ |
| Boss death + GOAL unlocking | ✅ | ≥1 | ✅ |
| No regression on existing features | ✅ | ≥1 | ✅ |

---

## 8. Implementation Phases

### Phase 1: Constants + Data Layer
**Files:** `public/src/engine/constants.js`, `public/src/engine/world.js`
- Add ROOM_TYPE.BOSS, CELL.BOSS_PILLAR, DOOR_TYPE.BOSS, BOSS constants
- Add PILLAR_POSITIONS constant
- Add door type field to door/transition data structures
- **Risk:** Low — constants only, no behavioral changes
- **Est. lines:** ±30

### Phase 2: Boss Entity + Room Generation
**Files:** `public/src/engine/entities.js`, `public/src/engine/generator.js`
- Implement `createBoss()` factory with dual-column segment arrays
- Modify `assignRoomTypes()` to place BOSS room before GOAL
- Modify `generateRoomTiles()` to place 4 BOSS_PILLAR cells in BOSS rooms
- Add boss door placement logic
- **Risk:** Low-Medium — generator is well-understood; boss entity is new but follows existing patterns
- **Est. lines:** ±80

### Phase 3: Boss AI System
**Files:** `public/src/engine/bossAI.js` (new)
- Implement `resolveBossPhase()` — mode dispatch with priority cascade
- Implement `bossChase()` — pathfinding toward player
- Implement `bossCharge()` — windup → dash → recovery cycle
- Implement `bossSingleSnake()` — single-snake mode with head alternation
- Implement `bossSeekFood()` — food priority overriding other modes
- **Risk:** Medium — most complex module; charge timing and single-snake head-swap need careful testing
- **Est. lines:** ±200

### Phase 4: Collision + Combat
**Files:** `public/src/engine/collision.js`, `public/src/engine/combat.js`
- Add boss-player collision detection (damage with segment loss)
- Add boss-pillar collision (pillar destruction)
- Add player-pillar collision (damage, not death)
- Implement `applyBossDamage()` with column-specific tail removal
- Implement food physics bounce (`spawnFoodWithPhysics()`)
- Implement food decay timer system
- **Risk:** Medium — food bounce physics is new; collision extensions touch existing systems
- **Est. lines:** ±120

### Phase 5: Game Loop Integration
**Files:** `public/src/engine/core.js`
- Modify GOAL room victory check to require `state.bossDefeated`
- Add boss room entry handler (intro → boss creation → door lock)
- Add `updateBoss()` call in main tick loop
- Add boss intro timing/pause logic
- **Risk:** Medium — touches core game loop; must not break normal gameplay
- **Est. lines:** ±50

### Phase 6: Rendering + Visuals
**Files:** `public/src/render/room.js`, `public/src/render/hud.js`, `public/src/render/overlays.js`, `public/src/render/renderer.js`
- Render boss entity (dual-column blue snake with eyes)
- Render CELL.BOSS_PILLAR (with destruction animation)
- Render boss door (distinct visual)
- Add boss HP bar to HUD
- Add boss intro cinematic (letterbox, text, dialogue)
- Add screen-shake during charge
- Add food flash animation
- **Risk:** Low-Medium — rendering is visual only; no game logic changes
- **Est. lines:** ±150

### Phase 7: Polish + Edge Cases
- Food decay visual polish (flash rate acceleration)
- Boss stuffed state animation
- Minimap boss room icon
- Save/load guard for boss room
- Edge case hardening (boss HP exactly 2 transition, player 0-length snake, multiple foods)
- **Est. lines:** ±50

---

## 9. Test Specifications

### Normal Path Tests
1. **Boss entity created correctly**: `createBoss(10, 10)` returns a boss with 2 columns, each 3 segments, total HP=6, colHp=3, name="Blue Hammer"
2. **Boss chase mode**: Boss moves toward player when player is in same room (no food on field, HP > 4)
3. **Boss charge mode**: Boss at HP ≤ 4 enters charge mode — windup → dash → recovery cycle
4. **Boss single-snake mode**: Boss at HP ≤ 2 enters single-snake mode with one active head
5. **Boss food priority**: When food is on field, boss paths toward food overriding chase/charge/single-snake
6. **Boss death → GOAL unlock**: When boss HP reaches 0, `bossDefeated` is set, GOAL room becomes accessible
7. **Player defeats boss → victory**: Walking into GOAL room after boss defeat triggers 'won' state

### Edge Case Tests (≥3)
1. **Boss HP exactly 2 (transition boundary)**: Boss at exactly 2 HP should be in single-snake mode. After eating food to reach 4 HP, returns to charge mode.
2. **Boss eats food past max length — stuffed state**: Boss at 6 total length (3+3) eats food → length exceeds 6 → enters stuffed state (immobile for N ticks)
3. **Boss eats food during charge windup**: Food appears during windup → boss interrupts charge → switches to food priority → after eating, returns to charge
4. **Player enters boss room with ≤3 segment snake**: Boss fight still proceeds normally; if snake reaches 0, player dies normally (game over)
5. **Multiple food items on field**: Boss uses `findNearest` to path to closest food; player can manipulate boss movement with food placement
6. **Boss single-snake head swap on player collision**: In single-snake mode, boss hitting player swaps active head, alternates direction

### Failure Path Tests
1. **Boss AI invalid state fallback**: If `resolveBossPhase()` returns undefined/null, boss defaults to CHASE mode
2. **Boss pillar destruction doesn't crash**: Boss collides with pillar → pillar becomes FLOOR → game state intact
3. **Player-pillar collision doesn't kill**: Player collides with BOSS_PILLAR → loses 1 segment + drops food → still alive (unless length 0)
4. **Player dies during boss fight**: Snake length reaches 0 → game over screen shown → player can reload from save (not from boss room)
5. **Food decay timer expires**: Food with timer=0 disappears from game — no dangling references, no crash
6. **Save/load in boss room**: Loading a save while in boss room resets boss fight (bossDefeated=false, bossFight phase reset)

---

## 10. Files Changed（按層匯總）

### Engine Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/engine/constants.js` | Add ROOM_TYPE.BOSS, CELL.BOSS_PILLAR, DOOR_TYPE.BOSS, BOSS.const, PILLAR_POSITIONS | ±30 |
| `public/src/engine/entities.js` | Add `createBoss()` factory, food physics fields | ±50 |
| `public/src/engine/bossAI.js` | New: boss behavior state machine (4 modes + food priority) | ±200 |
| `public/src/engine/core.js` | Boss room entry handler, conditional GOAL check, updateBoss() integration, intro pause | ±50 |
| `public/src/engine/collision.js` | Boss-player, boss-pillar, player-pillar collision checks | ±60 |
| `public/src/engine/combat.js` | `applyBossDamage()`, `bossDeath()`, `spawnFoodWithPhysics()`, food decay system | ±80 |
| `public/src/engine/generator.js` | BOSS room placement in assignRoomTypes(), pillar generation | ±40 |
| `public/src/engine/world.js` | Door type enum, room data updates for boss fields | ±10 |

### Render Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `public/src/render/room.js` | Boss door, boss entity, BOSS_PILLAR rendering | ±80 |
| `public/src/render/hud.js` | Boss HP bar display | ±30 |
| `public/src/render/overlays.js` | Boss intro cinematic, boss victory screen | ±60 |
| `public/src/render/renderer.js` | Screen-shake during charge, letterbox effect | ±20 |

### Test Layer
| File | Change | Est. Lines |
|------|--------|-----------|
| `tests/boss-battle.test.js` | New: boss battle test suite (normal + edge + failure) | ±250 |

---

## 11. Verification Checklist

- [ ] Boss entity created with correct structure (2 columns, 6 HP, name, eyes)
- [ ] Boss room placed adjacent to GOAL in world generation
- [ ] Boss door renders distinctly on room entry
- [ ] Boss intro cinematic plays on room entry (letterbox, name, dialogue, pause)
- [ ] All 4 boss behavior modes work correctly (chase, charge, single-snake, food priority)
- [ ] Boss eats food during charge → interrupts charge → seeks food → returns
- [ ] Boss at HP ≤ 2 transitions to single-snake mode; eats to ≥ 4 → returns to charge
- [ ] Boss at max length eats food → enters stuffed state (immobile)
- [ ] 4 pillars render in boss room at NE/NW/SE/SW
- [ ] Boss collides with pillar → pillar destroyed (becomes FLOOR), no boss damage
- [ ] Player collides with pillar → loses 1 segment + food drop (not death)
- [ ] Food dropped from damage has physics bounce + decays with flash animation
- [ ] Boss HP reaches 0 → bossDefeated=true → GOAL accessible → victory
- [ ] Player dies in boss room → game over → reload from last save
- [ ] Save/load during boss room → boss fight resets
- [ ] Boss HP bar visible in HUD during boss fight
- [ ] No regression on existing GOAL room behavior (when boss already defeated or no boss room in future game modes)
- [ ] All pre-existing tests still pass
