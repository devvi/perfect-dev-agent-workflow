# Direct Implementation from Pre-Written Tests

When OpenCode falls back and you implement directly, this approach minimises iterations:

## Step 0: Import Inventory

**Read the test file imports first.** This tells you:
- Exactly which exports each source module must provide
- The exact function signatures expected (number of params, return types)
- Which constants, enums, and types are referenced

Example from boss-battle.test.js imports:
```
constants.js → ROOM_SIZE, CELL, ROOM_TYPE, DOOR_TYPE, BOSS, PILLAR_POSITIONS, DIR
entities.js → createSnake, createBoss, createFood
collision.js → checkBossCollision, checkPillarCollision, checkFoodDecay
combat.js → applyBossDamage, bossDeath, spawnFoodWithPhysics, updateFoodDecay
generator.js → generateWorldMap, assignRoomTypes, generateRoomTiles
core.js → tick, createInitialState, startGame, changeDirection
```

Build a mental or written export map before touching any file.

## Step 1: Constants First (no behavior dependencies)

Add new enums, types, and config objects to `constants.js`. The test will fail on `undefined` imports until these exist. Do constants alone, then run tests to confirm the import errors resolve.

**Checklist:**
- [ ] New ROOM_TYPE values
- [ ] New CELL types
- [ ] New enum (e.g. DOOR_TYPE)
- [ ] New config object (e.g. BOSS with MAX_HP, etc.)
- [ ] New position arrays (e.g. PILLAR_POSITIONS)
- [ ] Palette additions

## Step 2: Entity Factories (pure data)

Add factory functions that return the data structure the tests expect. The test calls the factory and checks the returned object's fields — no logic needed yet.

## Step 3: Business Logic (module order = dependency order)

Implement in dependency order:
1. **combat.js** — pure functions that modify entities (no world/room knowledge needed)
2. **collision.js** — detection functions (check for overlap, return strings)
3. **generator.js** — procedural changes (room placement, tile generation)
4. **core.js** — game loop integration (state management, flow control)
5. **bossAI.js** — AI system (called by core.js, depends on entities + constants)

Each step: implement the minimum exports needed by the test, run the focused test file, fix, move on.

## Step 4: Test the Inline Helpers

Plan-phase test files contain inline helpers (e.g. `makeBoss()`, `phaseForHP()`) that approximate the real functions. Before trusting the test assertions:

1. **Trace by hand** — write out the state changes for each call in sequence. Count every decrement, pop, and push.
2. **Compare** — does the test assertion match your trace? If not, the inline helper may have had an edge case or the assertion was written for a slightly different design. Fix the test, not the implementation.
3. **Common divergence** — The inline helper `applyDamage()` in the test and the real `applyBossDamage()` may differ on what happens to an already-empty column (HP decrement vs no-op). Choose the design that makes most sense, then correct the test.

## Step 5: Full Suite Before PR

Never create a PR based on the focused test file alone. Run the entire suite:
```bash
npx vitest run 2>&1 | tail -20
```

New features in core game logic (tick(), collision detection) often break existing tests via:
- State shape changes (new required fields)
- Behavior gating (new conditions that block previously-passing paths)
- Tile type validation (new CELL values not in existing whitelists)

Fix these with backward-compat checks before PR.

## Layer Implementation Order (from DESIGN doc)

```
Phase 1: Constants + Data Layer     (constants.js, world.js)
Phase 2: Boss Entity + Room Gen     (entities.js, generator.js)
Phase 3: Boss AI System             (new module, e.g. bossAI.js)
Phase 4: Collision + Combat         (collision.js, combat.js)
Phase 5: Game Loop Integration      (core.js)
Phase 6: Rendering + Visuals        (room.js, hud.js, overlays.js, renderer.js)
Phase 7: Polish + Edge Cases        (animations, save guards, minimap)
```
