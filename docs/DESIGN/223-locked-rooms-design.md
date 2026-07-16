# DESIGN: #223 — Locked Rooms Don't Work (带锁的房间不工作)

> **Parent Issue:** #223
> **Design based on PRD:** `docs/PRD/223-locked-rooms-dont-work.md`
> **Approach:** A — Comprehensive Fix (all 5 bugs)
> **Date:** 2026-07-16

---

## 1. Architecture Overview

Five bugs across three engine modules and two test files. The fix spans the key/lock system and the size-gate system, both of which gate room access but through different mechanics.

### Data Flow — Key/Lock System

```
Generator                Game Loop (core.js)         Collision
─────────                ───────────────────         ─────────
placeKeysAndLocks()      tick() → room transition    checkDoorPassable()
  │                        │                           │
  │  Assign keyId + lock   │  Detect KEY_SHRINE room   │  Check door.locked
  │  on path[0]→goal       │  → Add keyId to           │  → Verify keyId in
  │                        │    state.keysFound         │    state.inventory
  ▼                        ▼                           ▼
world.keyAssignments      s.keysFound.add(kid)        passable = has key?
```

### Data Flow — Size-Gate System

```
Generator                Game Loop (core.js)         Collision
─────────                ───────────────────         ─────────
placeSizeGates()          tick() → room transition    checkDoorPassable()
  │                         │                           │
  │  Pick NORMAL room       │  Mark sizeGate.unlocked   │  Check NEXT room's
  │  Set requiredLength     │  = true on entry           │  sizeGate (not current)
  │  + doorDir              │                            │  → Only block entry
  ▼                         ▼                           ▼
room.sizeGate = {         nextRoom.sizeGate.          passable = entry check
  requiredLength: N,       unlocked = true             (exit always ok)
  doorDir: DIR
}
```

---

## 2. Data Model Changes

### Existing — No changes needed (`world.js`)

```js
// Already present — unchanged
sizeGate: null,

// Door structure — unchanged
{ connectedTo: { roomX, roomY }, locked: false, keyId: null }
```

### New field — `sizeGate.unlocked` (runtime-only, not in `world.js` initializer)

When the player successfully enters a size-gated room, set `unlocked = true`. This flag is **persisted** as part of `room.sizeGate` through the existing save/load serialization (save.js:76 already serializes `room.sizeGate` as-is).

```js
room.sizeGate = {
  requiredLength: 7,   // Snake length needed to enter
  doorDir: 'right',    // Which door the gate blocks (entry only)
  unlocked: false,     // ← NEW: set true once player enters
}
```

---

## 3. Module-by-Module Design

### 3.1 Bug A — Key Collection in Game Loop (`public/src/engine/core.js`)

**Location:** `tick()`, after room transition (around line 218), after existing room-type checks.

**Logic:**
```
After the new room is confirmed (within the transition block):

if newRoom.type === ROOM_TYPE.KEY_SHRINE:
  1. Look up keyAssignment for this shrine room
     → find keyAssignment where lockRoom.x === newRoom.x && lockRoom.y === newRoom.y
  2. If found and keyId not already in keysFound:
     a. s.keysFound.add(keyId)
     b. s.inventory.keys.add(keyId)
     c. Set s.doorMessage = '🔑 KEY ACQUIRED!'
```

**Why this location:** The room transition block (lines 196–218) already handles GOAL, BOSS, and SAVE types. Adding KEY_SHRINE here is consistent and ensures the key is available before collision checks run on subsequent ticks.

**Check order:** GOAL → BOSS → SAVE → KEY_SHRINE → tile consistency. KEY_SHRINE must come after SAVE (save triggers serialization that includes keys) but before tile consistency.

### 3.2 Bug B — Lock Placement (`public/src/engine/generator.js`)

**Decision:** **Keep current placement** (lock on shrine's exit door toward goal). No code change needed.

**Rationale:** The lock on the shrine's exit toward the goal is correct design:
1. Player approaches shrine from the start side (unlocked side) → enters freely
2. Inside shrine → collects key (Bug A fix)
3. Exits toward goal → lock checks key → opens
4. Flow: Key is INSIDE the shrine that the lock guards the exit of

**Documented design intent for `placeKeysAndLocks()`:**
- `path = findPath(shrine, goal)` — path from shrine toward goal
- Lock placed on `path[0]`'s door toward `path[1]` — the shrine's exit toward the goal
- The opposite-door (entering the shrine) remains unlocked
- Every key shrine has exactly one corresponding lock
- All locks are assigned unique `keyId` values

### 3.3 Bug C — Generate sizeGate Rooms (`public/src/engine/generator.js`)

**New function: `placeSizeGates(world, rng)`**

Called in `generateMapInternal()` **after** `placeKeysAndLocks()` (Phase 4a) and **before** tile generation (Phase 5).

**Algorithm:**
```
function placeSizeGates(world, rng):
  gateCount = 1 + random(0..1)  // 1-2 gates per map
  placed = 0
  attempts = 0

  while placed < gateCount AND attempts < 30:
    Pick random room (rx, ry)
    Skip if:
      - Not NORMAL type
      - Is start room (0,0)
      - Already has a size gate
      - Has no doors

    Pick a random door direction
    Calculate requiredLength:
      distFromStart = |rx| + |ry|
      requiredLength = 3 + floor(distFromStart / 3) * 2
      // Distance 1 → 3, Distance 2 → 3, Distance 3 → 5, Distance 4 → 5, etc.

    room.sizeGate = { requiredLength, doorDir, unlocked: false }
    placed++
    attempts++
```

**Difficulty curve justification (from PRD spike):**
| Distance | Required Length | Foods needed above start (3) | Feasibility |
|----------|----------------|-------------------------------|-------------|
| 1        | 3              | 0                             | Always passable |
| 2        | 3              | 0                             | Always passable |
| 3        | 5              | 2                             | Easy |
| 4        | 5              | 2                             | Easy |
| 5        | 7              | 4                             | Moderate |
| 6        | 7              | 4                             | Moderate |

The floor ensures a minimum of 3 (the starting snake length), so the closest gates are always passable.

**Integration in `generateMapInternal()`:**
```
// Phase 4: Place keys and locks
placeKeysAndLocks(world, rng);

// Phase 4a: Place size gates ← NEW
placeSizeGates(world, rng);

// Phase 5: Generate interior tiles (unchanged)
```

### 3.4 Bug D — Fix sizeGate Directionality (`public/src/engine/collision.js`)

**Current (wrong) — checks current room:**
```js
// Blocks both entry AND exit through the gated door
if (room.sizeGate && room.sizeGate.doorDir === doorDir) { ... }
```

**Fixed — check next room's sizeGate (entry-only):**

```
function checkDoorPassable(state, doorDir):
  1. Get current room
  2. Check boss door (existing)
  3. Check locked door (existing)
  4. NEW: Check NEXT room's size gate:
     a. Compute adjacent room position:
        nextRoom = getRoomAt(world,
          currentRoom.x + (doorDir === 'right' ? 1 : doorDir === 'left' ? -1 : 0),
          currentRoom.y + (doorDir === 'down' ? 1 : doorDir === 'up' ? -1 : 0)
        )
     b. If nextRoom AND nextRoom has a sizeGate:
        i.   Compute opposite direction of doorDir (i.e., the direction from
             the next room back into the current room)
        ii.  If nextRoom.sizeGate.doorDir === oppositeDir:
             - Player is ENTERING the gated room
             - If NOT unlocked AND snake length < requiredLength → BLOCK with size_gate reason
             - Otherwise → allow (always passable if unlocked)
        iii. If NOT matching → allow (gate is on a different door)
     c. If no nextRoom → allow
```

**Helper needed from `world.js`:** `oppositeDir()` already exists at line 133 — reuse it.

**Unlocked flag lifecycle:**
- Set in `core.js` when player successfully transitions into a size-gated room
- Inserted after the room transition block, right after the existing type checks
- `if (newRoom.sizeGate && !newRoom.sizeGate.unlocked) newRoom.sizeGate.unlocked = true;`

### 3.5 Bug E — Fix Test Fixtures

**Changes:**
| File | Line | Old | New |
|------|------|-----|-----|
| `tests/renderer.test.js` | 39 | `sizeGate: false` | `sizeGate: null` |
| `tests/title-version.test.js` | 200 | `sizeGate: false` | `sizeGate: null` |

---

## 4. Solvability Impact

### Key/Lock Solvability

The existing `bfsWithKeys()` in `generator.js` already handles key/lock solvability. Key collection in the BFS happens at line 390-395 (though it adds ALL keys for any shrine visited — which is an approximation, not a bug since shrines and keys are 1:1). With Bug A fixed, the game loop matches the BFS logic.

### Size Gate Solvability

The existing `verifySolvability()` → `bfsWithKeys()` does **not** consider size gates. This needs attention:

**Option (recommended):** Extend `bfsWithKeys()` to track snake length. Since the snake starts at length 3 and grows by eating food, track `maxLength` alongside keys. For now, size gate lengths are low (3-7) and food is abundant, so the practical risk of unsolvability is low. A full length-aware BFS is tracked as a future enhancement.

**Current safeguard:** `generateWorldMap()` loops up to 3 attempts, falling back to `buildSafeMap()`. If size gates made a map unsolvable, a retry would likely generate a map with more reachable food.

---

## 5. Rendering Impact

### Room Renderer (`public/src/render/room.js`, lines 172–184)

Already handles size gate rendering — draws `'LEN N+'` on the door. No changes needed.

### Minimap (`public/src/render/minimap.js`, lines 80–86)

Already shows size gate indicator (orange). No changes needed.

### HUD (`public/src/render/hud.js`, lines 28–31)

Already shows key count via `state.keysFound.size`. No changes needed — Bug A fix populates this Set correctly.

---

## 6. Save/Load Impact

### Serialization (`public/src/engine/save.js`, line 76)

`serializeWorld()` already includes `sizeGate: room.sizeGate` — the `unlocked` boolean will be serialized automatically.

### Deserialization (`public/src/engine/save.js`, `deserializeWorld()`)

Already uses spread operator — `sizeGate.unlocked` is preserved.

### Key state serialization (line 35)

Already serializes `[...state.keysFound]` — after Bug A, this contains actual key IDs.
Deserialization at line 131 restores as `new Set(saveData.inventory.keys || [])`.

---

## 7. Constants & Configuration

No new constants needed. The size gate difficulty formula is a simple expression:

```js
const requiredLength = 3 + Math.floor(distFromStart / 3) * 2;
```

This is inline in `placeSizeGates()` — could be extracted to a named constant or config in the future, but is not needed now.

---

## 8. Dependencies

| Dependency | Status | Impact |
|-----------|--------|--------|
| `world.js` (data model) | No changes needed | `sizeGate: null` already defined |
| `constants.js` | No changes needed | All types and enums exist |
| `save.js` (serialization) | No changes needed | Already serializes sizeGate + keysFound |
| `room.js` (renderer) | No changes needed | Already renders size gate |
| `hud.js` (HUD) | No changes needed | Already shows key count |
| `minimap.js` | No changes needed | Already shows size gate indicator |
