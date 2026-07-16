# DESIGN: #223 — Locked Rooms Don't Work (带锁的房间不工作)

> **Parent Issue:** #223
> **Agent:** plan-agent
> **Date:** 2026-07-16

---

## 1. Architecture Overview

### Core Idea

Fix the locked-room and size-gate systems so they actually work: implement key collection on shrine entry, add size-gate generation to the map generator, fix collision directionality so gates block entry only (not exit), and mark rooms permanently unlocked once entered. Five bugs across the engine layer, generator, collision system, and test fixtures.

### Data Flow

```ascii
    Generator (generator.js)            Game Loop (core.js)              Collision (collision.js)
    ────────────────────────            ────────────────────             ─────────────────────────
    placeKeysAndLocks()
      │  Assign keyId + lock
      │  on shrine's exit → goal          tick() → room transition        checkDoorPassable()
      │                                      │                               │
      ▼                                      │  Detect KEY_SHRINE            │  Check door.locked
    world.keyAssignments                     │  → Add key to state           │  → Verify key in
                                             │    .keysFound + .inventory    │    state.inventory
    placeSizeGates() [NEW]                   │                               │
      │  Pick NORMAL rooms                   │  Detect size-gated room       │  Check NEXT room's
      │  Set requiredLength + doorDir        │  → Mark .sizeGate.unlocked    │    sizeGate
      │  + unlocked flag                     │    = true                     │  → Block entry only
      ▼                                      ▼                               ▼
    room.sizeGate = {                       newRoom.sizeGate.               passable = entry gate ok
      requiredLength: N,                    unlocked = true                  (exit always allowed)
      doorDir: DIR,
      unlocked: false
    }
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Lock placement | Keep current (shrine's exit toward goal) | Player enters freely → gets key inside → exits toward goal through locked door. Works with Bug A fix. |
| Size-gate directionality | Check NEXT room's gate, not current | Blocks entry only. Player can always exit a gated room even if length drops. |
| `sizeGate.unlocked` flag | Runtime boolean on room object | Persisted automatically via existing save serialization. No schema migration needed. |
| Size-gate difficulty | `3 + floor(distFromStart / 3) * 2` | Meaningful gating without being unsolvable. Start length=3 always meets adjacent gates. |
| `placeSizeGates()` placement | Phase 4a (after keys/locks, before tile gen) | Gates use same random RNG stream; tile generation is independent of gate state. |

---

## 2. Engine Layer Changes

> Game loop (`core.js`): room transition handling, size-gate unlock on entry

### State Additions

No new state fields. Existing fields used:
- `s.keysFound` (Set) — populated by Bug A fix
- `s.inventory.keys` (Set) — populated by Bug A fix
- `s.doorMessage` (string) — set to `'🔑 KEY ACQUIRED!'`
- `room.sizeGate.unlocked` — new boolean on existing `sizeGate` object

### Game Loop Changes (`core.js`)

**Location:** In `tick()`, after room transition block (~line 218). The existing block handles GOAL, BOSS, SAVE, and tile consistency. Add:

1. **KEY_SHRINE handler** — after SAVE check (line 214), before tile consistency (line 217):
   ```js
   // Check if entering key shrine → collect key
   if (newRoom.type === ROOM_TYPE.KEY_SHRINE) {
     const keyAssignment = s.world.keyAssignments.find(ka =>
       ka.lockRoom.x === newRoom.x && ka.lockRoom.y === newRoom.y
     );
     if (keyAssignment && !s.keysFound.has(keyAssignment.keyId)) {
       s.keysFound.add(keyAssignment.keyId);
       s.inventory.keys.add(keyAssignment.keyId);
       s.doorMessage = '🔑 KEY ACQUIRED!';
     }
   }
   ```

2. **sizeGate unlock** — after the entire room transition block (after line 218):
   ```js
   // If the new room has a size gate, mark it as unlocked
   if (newRoom.sizeGate && !newRoom.sizeGate.unlocked) {
     newRoom.sizeGate.unlocked = true;
   }
   ```

**Check order:** GOAL → BOSS → SAVE → KEY_SHRINE → tile consistency → sizeGate unlock

### Collision Changes (`collision.js`)

**Location:** `checkDoorPassable()` function (~line 274-279)

**Current (wrong):**
```js
if (room.sizeGate && room.sizeGate.doorDir === doorDir) {
  const required = room.sizeGate.requiredLength;
  if (state.snake.length < required) {
    return { passable: false, reason: 'size_gate' };
  }
}
```

**Fixed — check next room's size gate (entry-only):**
```js
// Check size gate on the NEXT room (entry gate — blocks entering the gated room)
const nextRx = currentRoom.x + (doorDir === 'right' ? 1 : doorDir === 'left' ? -1 : 0);
const nextRy = currentRoom.y + (doorDir === 'down' ? 1 : doorDir === 'up' ? -1 : 0);
const nextRoom = getRoomAt(world, nextRx, nextRy);
if (nextRoom && nextRoom.sizeGate) {
  const oppositeDir = oppositeDir(doorDir);  // direction from next room back to current
  if (nextRoom.sizeGate.doorDir === oppositeDir) {
    // Player is ENTERING the gated room
    if (!nextRoom.sizeGate.unlocked && state.snake.length < nextRoom.sizeGate.requiredLength) {
      return { passable: false, reason: 'size_gate' };
    }
  }
  // If gate direction doesn't match → not the gated door → passable
  // If already unlocked → always passable
}
```

Note: The existing `oppositeDir()` function from `world.js` is already imported via the file's existing import chain.

---

## 3. Entity Layer Changes

> Generator (`generator.js`): new `placeSizeGates()` function, lock placement documentation

### New Function: `placeSizeGates(world, rng)`

**File:** `public/src/engine/generator.js` — new exported function placed near `placeKeysAndLocks()`.

**Signature:** `function placeSizeGates(world, rng = Math.random)`

**Algorithm:**
```js
function placeSizeGates(world, rng = Math.random) {
  const { cols, rows, rooms } = world;
  const gateCount = 1 + Math.floor(rng() * 2);  // 1-2 size gates
  let placed = 0;

  for (let attempts = 0; attempts < 30 && placed < gateCount; attempts++) {
    const rx = Math.floor(rng() * cols);
    const ry = Math.floor(rng() * rows);
    const room = rooms[ry][rx];

    // Only on NORMAL rooms that aren't start/goal/key/save/gacha
    if (room.type !== ROOM_TYPE.NORMAL) continue;
    if (rx === 0 && ry === 0) continue;  // Don't gate start room

    // Pick a door direction that connects somewhere
    const doorDirs = Object.keys(room.doors).filter(d => room.doors[d]);
    if (doorDirs.length === 0) continue;

    const doorDir = doorDirs[Math.floor(rng() * doorDirs.length)];

    // Calculate required length based on distance from start
    const distFromStart = Math.abs(rx) + Math.abs(ry);
    const requiredLength = 3 + Math.floor(distFromStart / 3) * 2;  // 3, 5, 7, ...

    room.sizeGate = { requiredLength, doorDir, unlocked: false };
    placed++;
  }
}
```

### Existing Entity Modifications

**generator.js — `generateMapInternal()` integration (line 73–75):**
```js
// Phase 4: Place keys and locks
placeKeysAndLocks(world, rng);

// Phase 4a: Place size gates ← NEW
placeSizeGates(world, rng);

// Phase 5: Generate interior tiles for each room
```

### Lock Placement Documentation (generator.js — `placeKeysAndLocks()`)

Current behavior (Bug B) — document as intentional:
- `path = findPath(shrine, goal)` — path from shrine toward goal
- Lock placed on `path[0]`'s door toward `path[1]` — the shrine's exit toward the goal
- The opposite-direction door (entering the shrine) remains unlocked
- This is correct design: player enters shrine freely → gets key → exits toward goal through locked door

---

## 4. Data Layer Changes

> Constants, config, world model

### No New Constants

The size-gate difficulty formula is inline in `placeSizeGates()`:
```js
const requiredLength = 3 + Math.floor(distFromStart / 3) * 2;
```

### Existing Model — No Changes (`world.js`)

The `sizeGate` field already defaults to `null` on `createRoom()` (world.js:22). The `unlocked` boolean is added at runtime by `placeSizeGates()`.

### New Runtime Data on `room.sizeGate`

```js
// Before (Bug C — never set)
room.sizeGate = null;

// After (set by placeSizeGates)
room.sizeGate = {
  requiredLength: 5,    // Snake length needed to enter
  doorDir: 'right',     // Which door the gate blocks (entry only)
  unlocked: false,      // Set to true once player successfully enters
};
```

### Save Data Impact

No schema changes. Existing serialization handles:
- `serializeWorld()` (save.js:76) — already includes `room.sizeGate` as-is
- `deserializeWorld()` — already uses spread operator, preserves `unlocked`
- Key state serialization — already serializes `[...state.keysFound]` and restores as `new Set(...)`

---

## 5. Render Layer Changes

> Room renderer, minimap, HUD — no code changes needed

### Room Renderer (`public/src/render/room.js`, lines 172–184)

Already renders size-gate indicator (`'LEN N+'`) on the door edge. No changes needed — the renderer checks `room.sizeGate` which now will be populated.

### Minimap (`public/src/render/minimap.js`, lines 80–86)

Already shows size-gate rooms with an orange indicator. No changes needed.

### HUD (`public/src/render/hud.js`, lines 28–31)

Already shows key count via `state.keysFound.size`. With Bug A fix, this Set is now correctly populated on shrine entry.

### Door Messages

- `state.doorMessage = '🔑 KEY ACQUIRED!'` — displayed when collecting a key (Bug A fix)
- Existing `'NEEDS KEY'` message — shown when trying to pass a locked door without key (already works)
- Existing `'LEN N+'` display — shown on size-gated doors (already rendered)

---

## 6. Input/UI Layer Changes

> No changes needed.

No new controls, no new UI elements. All changes are internal engine logic.

---

## 7. Test Layer Changes

> Test case descriptions (not runnable code — implement agent writes actual tests)

### Test Structure

- Primary test file to modify: `tests/metroidvania-snake.test.js` (new `describe('223 — Locked Rooms / Size Gates')` block)
- Test fixture fixes: `tests/renderer.test.js:39` and `tests/title-version.test.js:200`

### Coverage Requirements

| Area | Normal Path | Edge Cases | Failure Paths |
|------|-------------|------------|---------------|
| Key collection on shrine entry | ✅ | ≥2 | ✅ |
| Locked door passable with key | ✅ | ≥1 | ✅ |
| Size gate blocks entry (too short) | ✅ | ≥2 | ✅ |
| Size gate allows entry (long enough) | ✅ | ≥1 | — |
| Size gate allows exit always | ✅ | ≥1 | — |
| Size gate permanent unlock | ✅ | ≥1 | — |
| Size gate generation validity | — | ≥3 | — |
| Save/load persistence | ✅ | ≥1 | — |
| Map solvability with size gates | ✅ | ≥1 | ✅ |

### Test Case Descriptions

#### TC1: Key collected on KEY_SHRINE entry (Bug A)
- **Setup:** Generate a world, find a KEY_SHRINE room and its keyAssignment. Create initial state, position snake near the shrine's entrance door. Call `tick(state)` until room transition.
- **Assertions:**
  - `state.keysFound` contains the correct `keyId` after transition
  - `state.inventory.keys` contains the correct `keyId`
  - `state.doorMessage === '🔑 KEY ACQUIRED!'`
- **Edge:** Re-entering same shrine → no duplicate key. Shrine with no matching keyAssignment → no crash.

#### TC2: Locked door passable with correct key (Bug A + B)
- **Setup:** Generate a world, find a locked door and its corresponding key. Create state with key pre-added, position snake in the room containing the locked door.
- **Assertion:** `checkDoorPassable(state, doorDir)` returns `{ passable: true }` for the locked door.

#### TC3: Locked door blocked without key (regression guard)
- **Setup:** Generate a world, find a locked door. Create initial state (no keys).
- **Assertion:** `checkDoorPassable(state, doorDir)` returns `{ passable: false, reason: 'locked' }`.

#### TC4: Size gate blocks entry for too-short snake (Bug C + D)
- **Setup:** Set `room.sizeGate = { requiredLength: 100, doorDir: 'right', unlocked: false }` on a room. Snake length = 3. Snake is in the ADJACENT room (other side of the gated door). Call `checkDoorPassable(state, doorDir)` where `doorDir` is opposite of the gate's `doorDir`.
- **Assertions:**
  - Entry blocked: `{ passable: false, reason: 'size_gate' }`
  - Exit from gated room through gated door: `{ passable: true }`

#### TC5: Size gate allows entry when length meets requirement (happy path)
- **Setup:** `room.sizeGate = { requiredLength: 2, doorDir: 'right', unlocked: false }`. Snake length = 3.
- **Assertion:** Entry returns `{ passable: true }`.

#### TC6: Size gate exactly equal length passes (boundary)
- **Setup:** `room.sizeGate = { requiredLength: 3, doorDir: 'right', unlocked: false }`. Snake length = 3.
- **Assertion:** Entry returns `{ passable: true }`.

#### TC7: Size gate permanently unlocked after entry (Bug D — permanent unlock)
- **Setup:** Gated room with `requiredLength: 3`. Snake length = 3. Simulate entering room (call `tick()` until transition). Verify `room.sizeGate.unlocked === true`. Then reduce snake length below 3. Check exit.
- **Assertions:**
  - After entry: `room.sizeGate.unlocked === true`
  - After length drops: exit returns `{ passable: true }`

#### TC8: Size gate generation produces valid data (Bug C — generation correctness)
- **Setup:** Call `generateWorldMap(5, 5)` multiple times.
- **Assertions:**
  - At least 1 world has at least 1 size gate
  - Every `sizeGate` has: `requiredLength` (number ≥ 3), `doorDir` (string), `unlocked` (false)
  - No size gate on start room (0,0), no-door rooms, or non-NORMAL rooms

#### TC9: Size gate + key lock on same door (interaction)
- **Setup:** Create a room where a door is both locked and size-gated. Test combinations.
- **Assertions (key check first):**
  - No key + too short → `'locked'` (lock checked first)
  - With key but too short → `'size_gate'`
  - With key + sufficient length → `{ passable: true }`

#### TC10: Save/load preserves sizeGate.unlocked (persistence)
- **Setup:** Set `room.sizeGate = { requiredLength: 3, doorDir: 'right', unlocked: true }`. Serialize and deserialize.
- **Assertions:** Deserialized room preserves all fields.

#### TC11: Test fixture type fix (Bug E)
- **Setup:** Check `tests/renderer.test.js:39` and `tests/title-version.test.js:200`.
- **Change:** `sizeGate: false` → `sizeGate: null`
- **Assertion:** Fixture rooms have `room.sizeGate === null` (not `false`).

---

## 8. Files Changed (per-layer summary)

### Engine Layer

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Engine | `public/src/engine/core.js` | Add KEY_SHRINE handler + sizeGate unlock after room transition | +20 |
| Engine | `public/src/engine/collision.js` | Replace current-room sizeGate check with next-room entry-only check | +15 |
| Entity | `public/src/engine/generator.js` | Add `placeSizeGates()` function + call in `generateMapInternal()` | +35 |
| Entity | `public/src/engine/generator.js` | Document lock placement design intent (comment only) | +5 |

### Test Layer

| Layer | File | Change | Est. Lines |
|-------|------|--------|-----------|
| Tests | `tests/renderer.test.js` | Fix `sizeGate: false` → `null` at line 39 | +1 |
| Tests | `tests/title-version.test.js` | Fix `sizeGate: false` → `null` at line 200 | +1 |
| Tests | `tests/metroidvania-snake.test.js` | New test block for locked rooms + size gates | +120 |

**No changes to:** `public/src/engine/world.js`, `public/src/engine/save.js`, `public/src/render/room.js`, `public/src/render/minimap.js`, `public/src/render/hud.js`, `public/src/engine/constants.js`, `.github/`, `docs/`

---

## 9. Verification Checklist

- [ ] TC1: Key collected on KEY_SHRINE entry → `keysFound` + `inventory.keys` populated, `doorMessage` set
- [ ] TC2: Locked door passable when correct key is in inventory
- [ ] TC3: Locked door blocked when key is missing (regression)
- [ ] TC4: Size gate blocks entry (too short), allows exit always
- [ ] TC5: Size gate allows entry when length is sufficient
- [ ] TC6: Size gate allows entry when length exactly equals required length (boundary)
- [ ] TC7: Size gate permanently unlocked after entry (unlocked persists even after length drops)
- [ ] TC8: `placeSizeGates()` produces structurally valid data
- [ ] TC9: Lock + size gate on same door: key checked first, then length
- [ ] TC10: Save/load preserves `sizeGate.unlocked` flag
- [ ] TC11: Test fixtures use `sizeGate: null` (not `false`)
- [ ] No regression on existing features (boss rooms, save rooms, goal)
- [ ] All pre-existing tests still pass: `npx vitest run`
- [ ] `generateWorldMap()` still produces solvable maps (bfsWithKeys passes)
