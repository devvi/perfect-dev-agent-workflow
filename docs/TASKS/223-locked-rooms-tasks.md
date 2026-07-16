# TASKS: #223 — Locked Rooms Don't Work (带锁的房间不工作)

> **Parent Issue:** #223
> **PRD reference:** `docs/PRD/223-locked-rooms-dont-work.md`
> **Design reference:** `docs/DESIGN/223-locked-rooms-design.md`
> **Approach:** A — Comprehensive Fix

---

## Implement Phase — Tasks

| # | Task | File | Details |
|---|------|------|---------|
| 1 | Add key collection on KEY_SHRINE entry | `public/src/engine/core.js:210` | Add `ROOM_TYPE.KEY_SHRINE` handler after SAVE check. Find keyAssignment by shrine position, add `keyId` to `s.keysFound` and `s.inventory.keys`, set `s.doorMessage = '🔑 KEY ACQUIRED!'`. |
| 2 | Add `placeSizeGates()` function | `public/src/engine/generator.js` | New function after `placeKeysAndLocks()`. Places 1-2 size gates on NORMAL rooms. Calculates `requiredLength` based on distance from start: `3 + floor(dist/3) * 2`. Sets `unlocked: false`. |
| 3 | Call `placeSizeGates()` in generator pipeline | `public/src/engine/generator.js:73` | Add as Phase 4a after `placeKeysAndLocks(world, rng)` call, before tile generation. |
| 4 | Fix sizeGate direction in collision check | `public/src/engine/collision.js:274-279` | Replace current-room sizeGate check with next-room check. Only block ENTRY (opposite direction). Use existing `oppositeDir()` from `world.js`. |
| 5 | Mark sizeGate as unlocked on entry | `public/src/engine/core.js` | After room transition block, add: `if (newRoom.sizeGate && !newRoom.sizeGate.unlocked) newRoom.sizeGate.unlocked = true;` |
| 6 | Fix test fixture types | `tests/renderer.test.js:39` | Change `sizeGate: false` → `sizeGate: null` |
| 7 | Fix test fixture types | `tests/title-version.test.js:200` | Change `sizeGate: false` → `sizeGate: null` |
| 8 | Run full test suite | `npm run test` | Verify all unit tests pass with `vitest run` |

---

## Test Descriptions

The following test cases describe the expected behavior. Tests should be added to `tests/metroidvania-snake.test.js` in an appropriate describe block (e.g., `describe('223 — Locked Rooms / Size Gates')`).

---

### Test Case 1: Key collected on KEY_SHRINE entry

**Type:** Integration / functional
**Focus:** Bug A

**Setup:**
1. Generate a world with `generateWorldMap(5, 5)`
2. Find a KEY_SHRINE room and its keyAssignment
3. Create initial state
4. Manually position the snake near the shrine's entrance door
5. Call `tick(state)` until the room transition occurs

**Assertions:**
- After entering the KEY_SHRINE room, `state.keysFound` contains the correct `keyId`
- After entering the KEY_SHRINE room, `state.inventory.keys` contains the correct `keyId`
- `state.doorMessage` equals `'🔑 KEY ACQUIRED!'`

**Edge:**
- If the player re-enters the same KEY_SHRINE room (e.g., via backtracking), no duplicate key is added
- If a KEY_SHRINE room has no matching keyAssignment, no key is added (no crash)

---

### Test Case 2: Locked door passable with correct key

**Type:** Integration / functional
**Focus:** Bug A + B interaction

**Setup:**
1. Generate a world with `generateWorldMap(5, 5)`
2. Find a locked door and its corresponding keyAssignment
3. Create initial state with the key pre-added to `state.keysFound` and `state.inventory.keys`
4. Position the snake in the room containing the locked door
5. Call `checkDoorPassable(state, doorDir)` for the locked door direction

**Assertions:**
- `checkDoorPassable` returns `{ passable: true }`

---

### Test Case 3: Locked door blocked without key

**Type:** Integration / functional
**Focus:** Existing behavior (regression guard)

**Setup:**
1. Generate a world, find a locked door
2. Create initial state (no keys added)
3. Call `checkDoorPassable(state, doorDir)` for the locked door direction

**Assertions:**
- `checkDoorPassable` returns `{ passable: false, reason: 'locked' }`

---

### Test Case 4: Size gate blocks snake too short (entry check)

**Type:** Integration / functional
**Focus:** Bug C + D

**Setup:**
1. Generate a world with `generateWorldMap(5, 5)`
2. Manually set a size gate on a room:
   ```js
   room.sizeGate = { requiredLength: 100, doorDir: 'right', unlocked: false };
   ```
3. Create initial state (snake length = 3)
4. Position snake in the ADJACENT room (the room on the other side of the gated door)
5. Call `checkDoorPassable(state, doorDir)` where `doorDir` is the direction from the adjacent room INTO the gated room (opposite of gate's doorDir)
6. Also call `checkDoorPassable(state, otherDoorDir)` from inside the gated room trying to EXIT through the gated door

**Assertions:**
- Entry into gated room: blocked → `{ passable: false, reason: 'size_gate' }`
- Exit from gated room through gated door: allowed → `{ passable: true }`

---

### Test Case 5: Size gate passes snake meeting requirement

**Type:** Integration / functional
**Focus:** Bug C + D (happy path)

**Setup:**
1. Generate a world
2. Set `room.sizeGate = { requiredLength: 2, doorDir: 'right', unlocked: false }`
3. Create initial state (snake length = 3 ≥ 2)
4. Check entry from adjacent room

**Assertions:**
- `checkDoorPassable` returns `{ passable: true }` for entry

---

### Test Case 6: Size gate exactly equal length passes

**Type:** Integration / functional
**Focus:** Boundary condition

**Setup:**
1. Set `room.sizeGate = { requiredLength: 3, doorDir: 'right', unlocked: false }`
2. Snake length = 3

**Assertions:**
- `checkDoorPassable` returns `{ passable: true }` for entry

---

### Test Case 7: Size gate permanently unlocked after entry

**Type:** Integration / functional
**Focus:** Bug D — "permanent once unlocked"

**Setup:**
1. Generate a world with a size-gated room
2. Set `room.sizeGate = { requiredLength: 3, doorDir: 'right', unlocked: false }`
3. Create initial state with snake length = 3
4. Simulate entering the room:
   - Call `tick()` to transition into the gated room
   - After transition, verify `room.sizeGate.unlocked === true`
5. Manually reduce snake length below requirement (e.g., simulate self-collision tail pop)
6. Call `checkDoorPassable(state, doorDir)` for EXIT from the gated room

**Assertions:**
- After entry, `room.sizeGate.unlocked === true`
- After length drops below threshold, exit is still allowed (`{ passable: true }`)

---

### Test Case 8: sizeGate generation produces valid data

**Type:** Unit / generation
**Focus:** Bug C

**Setup:**
1. Call `generateWorldMap(5, 5)` multiple times (e.g., 10 seeds)
2. Collect all rooms with size gates

**Assertions:**
- At least 1 world has at least 1 size gate (non-deterministic, so run multiple seeds or verify structure)
- Every `sizeGate` object has: `requiredLength` (number ≥ 3), `doorDir` (string), `unlocked` (boolean false)
- No size gate is on the start room (0,0)
- No size gate is on a room with no doors
- No size gate is on a non-NORMAL room type

---

### Test Case 9: Size gate + lock on same door

**Type:** Integration / edge case
**Focus:** Both gate systems interacting

**Setup:**
1. Create a room where a door is both locked AND has a size gate
2. Test without key and too short → check which reason takes priority

**Assertions (design intent: key check first):**
- Without key AND too short → `{ passable: false, reason: 'locked' }` (lock checked first)
- With key but too short → `{ passable: false, reason: 'size_gate' }`
- With key AND sufficient length → `{ passable: true }`

---

### Test Case 10: Save/load preserves sizeGate.unlocked

**Type:** Integration / serialization
**Focus:** Persistence correctness

**Setup:**
1. Generate a world
2. Manually set `room.sizeGate = { requiredLength: 3, doorDir: 'right', unlocked: true }`
3. Serialize via `serializeWorld(world)` and deserialize via `deserializeWorld()`
4. Check the deserialized room

**Assertions:**
- Deserialized `room.sizeGate.unlocked === true`
- Deserialized `room.sizeGate.requiredLength === 3`
- Deserialized `room.sizeGate.doorDir === 'right'`

---

### Test Case 11: Solvability check still passes with size gates

**Type:** Integration / regression
**Focus:** Map generation loop

**Setup:**
1. Run `generateWorldMap(5, 5)` — the generation loop retries up to 3 times
2. Check the output world

**Assertions:**
- `generateWorldMap` returns a valid world (not null, not the safe-map fallback)
- `verifySolvability(world)` returns `true`
- World has at least some rooms connected to the start

Note: The current `bfsWithKeys()` does not track snake length. This test verifies the existing solvability check still passes despite size gates — the gates are placed on optional paths or paths where the starting length (3) meets the requirement.

---

### Test Case 12: Test fixture type fix — renderer

**Type:** Unit / regression
**Focus:** Bug E

**Setup:**
1. Import the renderer test module
2. Verify the WORLD_STUB's room objects use `sizeGate: null`

**Assertions:**
- `WORLD_STUB.rooms[0][0].sizeGate === null` (not `false`, not `undefined`)

### Test Case 13: Test fixture type fix — title-version

**Type:** Unit / regression
**Focus:** Bug E

**Setup:**
1. Import the title-version test module
2. Verify the room stub uses `sizeGate: null`

**Assertions:**
- Room stub's `sizeGate === null`

---

## Verification

After implementing all tasks and tests:

1. Run `npm run test` — all tests pass
2. Run `npx vitest run --reporter=verbose` to see individual test names
3. Verify the following scenarios by reading the code:
   - KEY_SHRINE entry adds key → locked door toward goal passable
   - Size-gated room blocks entry (too short) → allows entry (long enough) → stays unlocked
   - Size gate never generated on start room
   - Renderer and minimap show size gate indicator on generated gates
   - HUD shows key count after collection
