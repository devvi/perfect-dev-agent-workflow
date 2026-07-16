# Research: 带锁的房间不工作 — Locked Rooms Don't Work (Bug #223)

> Parent Issue: #223
> Agent: research-agent
> Date: 2026-07-16
> Status: Research Complete
> Priority: High

---

## 1. Problem Definition

### Current Behavior
Locked rooms / size-gated doors do not function correctly in the Metroidvania Snake game. Multiple bugs compound to produce two primary symptoms:

1. **Key-locked doors**: Player enters a KEY_SHRINE room freely (no lock blocks entry), but then cannot exit toward the goal because the lock is on the wrong door direction. Even if the lock were on the correct door, the player never receives a key item, so all locked doors remain impassable.

2. **Size-gated doors**: The `sizeGate` mechanic exists in the collision-check and renderer code but is **never generated** by the map generator — no room has a size gate. Even if it were, the collision check blocks BOTH entry AND exit through the gated door.

### Steps to Reproduce
1. Play the game (any generated map)
2. Navigate toward a KEY_SHRINE room (blue on minimap)
3. Observe: the door entering the shrine has no lock indicator — entry is always possible
4. Inside the shrine: nothing happens — no key is collected
5. Try to exit the shrine toward the goal: door shows lock 🔒, blocks passage with "NEEDS KEY" — **but the player was never given the key inside the shrine**

### Expected Behavior
- **Key-locked doors**: Lock should appear on the door the player must pass through to reach the key shrine. When the player enters the KEY_SHRINE room, the corresponding key should be added to their inventory.
- **Size-gated doors**: Should be generated on some room doors. The required length number should display on the door. Entry should be blocked if snake is too short. Once the player enters (meeting the requirement), the room should be permanently unlocked (exit allowed even if length later drops below threshold).

---

## 2. Root Cause Analysis

### Bug A: Key Collection Missing in Game Loop (CRITICAL)

| Aspect | Detail |
|--------|--------|
| **File** | `public/src/engine/core.js` |
| **Lines** | 196–218 |
| **Root Cause** | When the player enters a new room, the game loop handles GOAL (win), BOSS (intro), and SAVE (auto-save) room types — but **KEY_SHRINE is not handled at all**. |
| **Evidence** | In `tick()` (lines 196–218), after a room transition is confirmed, only `ROOM_TYPE.GOAL`, `ROOM_TYPE.BOSS`, and `ROOM_TYPE.SAVE` trigger behavior. A `ROOM_TYPE.KEY_SHRINE` room produces no action. |
| **Missing code** | No code adds the key ID to `state.keysFound` / `state.inventory.keys` upon entering a KEY_SHRINE room. The only place keys are added to inventory is in `generator.js`'s `bfsWithKeys()` (line 393) — but that's the solvability verification function, NOT the game loop. |
| **Effect** | Player enters shrine, gets no key → all locked doors remain impassable. |

### Bug B: Lock Placed on Wrong Side of Door

| Aspect | Detail |
|--------|--------|
| **File** | `public/src/engine/generator.js` |
| **Lines** | 289–311 |
| **Root Cause** | `placeKeysAndLocks()` finds a path from shrine → goal and locks path[0]'s door toward path[1] (the SHRINE's exit toward the goal). |
| **Analysis** | The lock is on the shrine room's door **leaving toward the goal**, but the player approaches the shrine from the **start side** (opposite direction). The door entering the shrine is NOT locked, so the player enters freely. The lock only blocks exit from the shrine toward the goal — which would be fine IF the player received the key inside (Bug A). |
| **Secondary issue** | Since only one side of the bidirectional door pair is locked (generator.js line 306), the opposite-direction door (the door from the goal side back into the shrine) is unencumbered. If the player can reach the shrine from the goal side via an alternate path, they bypass the lock entirely. |
| **Effect** | Lock is always on the wrong side for the player's typical approach direction. Combined with Bug A, exit is blocked with no way to obtain the key. |

### Bug C: sizeGate Never Generated (FEATURE NOT IMPLEMENTED)

| Aspect | Detail |
|--------|--------|
| **File** | `public/src/engine/generator.js` |
| **Lines** | Entire file |
| **Root Cause** | The `sizeGate` data structure exists (`world.js:22`: `sizeGate: null`), the renderer draws it (`room.js:173–184`, `minimap.js:81–86`), the collision checker validates it (`collision.js:274–279`), and the serializer preserves it (`save.js:76`). But **no code in the generator ever creates a `sizeGate` object on any room**. |
| **Evidence** | `grep -r "sizeGate" public/src/engine/` returns zero results in generator.js. `assignRoomTypes()`, `placeKeysAndLocks()`, `generateMapInternal()` — none set `room.sizeGate`. |
| **Effect** | The size-gate mechanic is entirely dead code. No room has a size gate. |

### Bug D: sizeGate Blocks Exit as Well as Entry (DESIGN FLAW)

| Aspect | Detail |
|--------|--------|
| **File** | `public/src/engine/collision.js` |
| **Lines** | 274–279 |
| **Root Cause** | The size gate check applies whenever the player moves **through the specified door direction**, regardless of whether they are entering or exiting. |
| **Analysis** | `checkDoorPassable` checks `room.sizeGate.doorDir === doorDir` against the current room. If the player is in the gated room and tries to exit through the gated door, the check fires and blocks them if their length is insufficient. |
| **Desired behavior** | Size gates should be **one-way**: they block entry (from the adjacent room into the gated room) but allow exit. Additionally, once a player has entered the room meeting the requirement, the room should stay unlocked — even if the snake's length later drops. |
| **Effect** | Even if size gates were generated, a player who enters (meeting the requirement), then shrinks (e.g., takes damage, loses tail segments), would be trapped inside the room. |

### Bug E: Test Fixtures Use Wrong Type for sizeGate (COSMETIC)

| Aspect | Detail |
|--------|--------|
| **Files** | `tests/renderer.test.js:39`, `tests/title-version.test.js:200` |
| **Root Cause** | Room stubs set `sizeGate: false` (boolean) instead of `null`. |
| **Risk** | Low — `false` is falsy so `if (room.sizeGate)` short-circuits correctly. But it's inconsistent with the actual data model (`world.js:22` uses `null`) and could fail if code uses `typeof room.sizeGate === 'object'`. |
| **Effect** | N/A — functions correctly but is a latent type mismatch. |

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/src/engine/core.js` | Game Loop | Add key collection on KEY_SHRINE room entry (after room transition) |
| `public/src/engine/generator.js` | Map Generation | Add sizeGate generation to rooms (choose a door, set requiredLength based on snake length gate) |
| `public/src/engine/collision.js` | Collision Detection | Fix sizeGate check to be one-way (entry only), add "unlocked once entered" tracking |
| `public/src/render/room.js` | Room Rendering | Already draws size gate / lock indicators — may need minor tweaks |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/render/hud.js` | HUD | May need key count display update |
| `tests/metroidvania-snake.test.js` | Tests | New test cases for key collection, size gate generation, one-way gate behavior |
| `tests/renderer.test.js` | Tests | Fix `sizeGate: false` → `null` |
| `tests/title-version.test.js` | Tests | Fix `sizeGate: false` → `null` |

---

## 4. Solution Comparison

### Approach A: Comprehensive Fix (Recommended)

**Description:** Fix all 5 bugs in a single coherent pass.

1. **Bug A — Add key collection in core.js**: When the player enters a KEY_SHRINE room, look up the matching key assignment and add it to `state.keysFound` / `state.inventory.keys`. Display a visual confirmation.
2. **Bug B — Fix lock placement**: Instead of locking the shrine's exit toward the goal, find the path from START to SHRINE and lock the door entering the shrine. OR: keep the current placement (lock on exit toward goal) but ensure the key is collected on entry so the exit is passable.
3. **Bug C — Generate size gates**: Add a `placeSizeGates()` function in generator.js that picks some rooms and sets `room.sizeGate = { requiredLength: N, doorDir: DIR }`. Choose N based on a difficulty curve proportional to distance from start.
4. **Bug D — Fix sizeGate directionality**: Change collision.js to only block entry (check opposite direction) and add a `room.sizeGate.unlocked` flag that's set to `true` once the player enters.
5. **Bug E — Fix test fixtures**: Change `sizeGate: false` to `sizeGate: null` in test stubs.

**Pros:**
- Fixes all identified issues in one pass
- Makes both key locks and size gates actually functional
- Size gates add gameplay depth (Metroidvania gating)

**Cons:**
- Multiple file changes
- Need to balance size gate difficulty (too high = unsolvable, too low = trivial)
- Key collection needs UI feedback (notification, HUD update)

**Risk:** Medium
**Effort:** 4-6 hours

### Approach B: Minimal Fix (Quick Patch)

**Description:** Only fix the most critical bugs (A, E) and leave size gates for future work.

1. **Bug A — Add key collection in core.js** (same as Approach A)
2. **Bug B — Accept current lock placement**: The lock on the shrine's exit toward the goal is acceptable design IF the player gets the key inside the shrine (Bug A fix).
3. **Bug E — Fix test fixtures**
4. Leave size gates unimplemented (Bug C, D) for a future issue.

**Pros:**
- Smaller scope
- Makes key-locked doors functional (the actual game-breaking bug)
- Low risk

**Cons:**
- Size gates remain dead code
- "Locked rooms" bug only partially fixed

**Risk:** Low
**Effort:** 1-2 hours

### Recommendation

→ **Approach A** because:
1. Bug C (sizeGate not generated) is a missing feature that was part of the original design intent — implementing it now is easier than tracking as a separate issue
2. Bug D (sizeGate blocks exit) would immediately manifest as a new bug the moment size gates are generated
3. The combined fix delivers a working lock + size gate system that adds meaningful gameplay depth
4. The test fixes (Bug E) are trivial and should be done regardless

---

## 5. Solution Details (Approach A)

### 5.1 Fix Bug A — Key Collection in Game Loop

**File:** `public/src/engine/core.js`

After the room transition block (lines 196–218), add a handler for `ROOM_TYPE.KEY_SHRINE`:

```js
// Check if entering key shrine → collect key
if (newRoom.type === ROOM_TYPE.KEY_SHRINE) {
  // Find the key assignment for this shrine room
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

**Note on lock placement strategy choice:** The current lock placement (lock on shrine's exit toward goal) works IF key collection happens on entry. The player enters the shrine freely → gets key → uses key to exit locked door toward goal. This is the intended flow.

**Alternative (fix lock placement instead):** Lock the door ENTERING the shrine (from the start side). Then the player needs to find the key from another shrine or source to enter. This would require redesigning the relationship between keys and shrines — each key would open a door to a DIFFERENT shrine, not the one containing it. This is more complex and not the current design intent.

**Recommendation:** Keep current lock placement + add key collection on shrine entry.

### 5.2 Fix Bug B — Verify Lock Placement Design

Accept the current design: lock is on the shrine's exit toward the goal. The player flow is:
1. Enter shrine freely (entrance door, opposite side, is unlocked)
2. Get key inside (Bug A fix)
3. Exit through locked door toward goal (key in inventory → door opens)

No code change needed for the lock placement itself, but **document the design intent**.

### 5.3 Fix Bug C — Generate sizeGate Rooms

**File:** `public/src/engine/generator.js`

Add a new function `placeSizeGates()` called in Phase 4 (after `placeKeysAndLocks`):

```js
/**
 * Place size gates on some rooms to create length-gated progression
 */
function placeSizeGates(world, rng = Math.random) {
  const { cols, rows, rooms } = world;
  const gateCount = 1 + Math.floor(rng() * 2); // 1-2 size gates
  let placed = 0;

  for (let attempts = 0; attempts < 30 && placed < gateCount; attempts++) {
    const rx = Math.floor(rng() * cols);
    const ry = Math.floor(rng() * rows);
    const room = rooms[ry][rx];

    // Only on NORMAL rooms that aren't start/goal/key/save/gacha
    if (room.type !== ROOM_TYPE.NORMAL) continue;
    if (rx === 0 && ry === 0) continue; // Don't gate start room

    // Pick a door direction that connects somewhere
    const doorDirs = Object.keys(room.doors).filter(d => room.doors[d]);
    if (doorDirs.length === 0) continue;

    const doorDir = doorDirs[Math.floor(rng() * doorDirs.length)];

    // Calculate required length based on distance from start
    const distFromStart = Math.abs(rx) + Math.abs(ry);
    const requiredLength = 3 + Math.floor(distFromStart / 3) * 2; // 3, 5, 7, ...

    room.sizeGate = { requiredLength, doorDir };
    placed++;
  }
}
```

Call this after `placeKeysAndLocks` in `generateMapInternal()`.

### 5.4 Fix Bug D — Fix sizeGate Directionality

**File:** `public/src/engine/collision.js` (lines 274–279)

The size gate should only block **entry** (player moving from adjacent room INTO the gated room), not exit. Currently it checks the door in the direction the player is moving.

**Wrong check (current):**
```js
if (room.sizeGate && room.sizeGate.doorDir === doorDir) {
  // Blocks both entry AND exit through that door
}
```

**Correct logic:**
- When `checkDoorPassable` is called, `doorDir` is the direction from currentRoom to newRoom
- If sizeGate is on currentRoom's doorDir → player is trying to EXIT the gated room → always allow
- If sizeGate is on the adjacent room's door pointing back → player is trying to ENTER the gated room → check length

The fix requires checking the **next room's** sizeGate, not the current room's:

```js
// Check size gate on the NEXT room (entry gate)
const nextRoom = getRoomAt(world, 
  currentRoom.x + (doorDir === 'right' ? 1 : doorDir === 'left' ? -1 : 0),
  currentRoom.y + (doorDir === 'down' ? 1 : doorDir === 'up' ? -1 : 0)
);
if (nextRoom && nextRoom.sizeGate) {
  const oppositeDir = doorDir === 'up' ? 'down' : doorDir === 'down' ? 'up' :
                      doorDir === 'left' ? 'right' : 'left';
  if (nextRoom.sizeGate.doorDir === oppositeDir) {
    // Player is entering a gated room
    if (!nextRoom.sizeGate.unlocked) {
      if (state.snake.length < nextRoom.sizeGate.requiredLength) {
        return { passable: false, reason: 'size_gate' };
      }
    }
  }
}
```

Add an `unlocked` flag to sizeGate — set when the player successfully enters:

```js
// In core.js, after successful room transition where nextRoom has sizeGate:
if (newRoom.sizeGate && !newRoom.sizeGate.unlocked) {
  newRoom.sizeGate.unlocked = true;
}
```

### 5.5 Fix Bug E — Fix Test Fixtures

**Files:** `tests/renderer.test.js` and `tests/title-version.test.js`

Change `sizeGate: false` to `sizeGate: null` in all room object stubs.

---

## 6. Acceptance Criteria

### Normal Path
1. Player enters KEY_SHRINE room → key is automatically collected → "🔑 KEY ACQUIRED!" message
2. Locked door (with correct key in inventory) → passable, no "NEEDS KEY" message
3. Locked door (without key) → blocked with "NEEDS KEY"
4. Size-gated room door → displays required length number on the door
5. Size-gated room (snake too short) → blocked with "NEEDS LENGTH N+"
6. Size-gated room (snake meets requirement) → player passes through
7. After entering size-gated room, player can exit freely even if snake length drops below threshold

### Edge Cases
1. Multiple KEY_SHRINE rooms → each gives its respective key
2. Player visits KEY_SHRINE again → no duplicate key (keysFound.has check)
3. Size gate required = 1 → effectively no gate (all snakes pass)
4. Size gate at maximum distance → required length is still reachable
5. Save/load → room sizeGate.unlocked persists correctly
6. All size gates placed → map remains solvable (verifySolvability check passes with length-gated paths)

### Failure Paths
1. Size gate impossible to reach → map generation retries (existing verification loop)
2. Key shrine with no corresponding lock assignment → safe fallback (no key to collect)
3. Room with both lock and size gate on same door → both checks apply (key first, then length)

---

## 7. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| `core.js` — room entry handling | Currently no KEY_SHRINE handler | Low |
| `generator.js` — no sizeGate generation | Need new function | Low |
| `collision.js` — sizeGate blocks both directions | Medium complexity change | Medium |
| `world.js` — data model | `sizeGate.unlocked` field needed | Low |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Boss key / boss door mechanics | Medium |
| Multiple key types | Low |

---

## 8. Spike / Experiment

### Questions to Answer
1. What is the correct requiredLength for size gates at different distances from start?
2. Is the current lock placement (exit from shrine toward goal) intuitive for players?

### Method
1. Test size gate values for a 5×5 grid: distance 1→3, 2→5, 3→7, 4→9
2. Verify these lengths are achievable by normal gameplay (eating food, not dying)

### Result
For a 5×5 grid:
- Starting length: 3 (default snake length)
- Distance 1 (adjacent room): min food to reach length 3 = 0 (already meet)
- Distance 2: length 5 = 2 food items (feasible in first 2 rooms)
- Distance 3: length 7 = 4 food items
- Distance 4: length 9 = 6 food items

These values provide meaningful gating without being unsolvable.
