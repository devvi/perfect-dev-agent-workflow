# Research: GameBoy HTML 404 — Engine JS not found on Vercel deployment

> Parent Issue: #11
> Agent: research-agent
> Date: 2026-07-06

---

## 1. Problem Definition

### Current Behavior
When opening `gameboy.html` on the deployed Vercel site, the browser console reports:
```
GET https://perfect-dev-agent-workflow.vercel.app/src/gameboy-snake-engine.js
net::ERR_ABORTED 404 (Not Found)
```
The game screen renders the LCD background and grid, but the game engine import fails silently, leaving the game in a non-functional state. The canvas renders static background but no snake, no food, and no game logic runs.

### Expected Behavior
The game should load without any 404 errors. The `gameboy-snake-engine.js` module should be served correctly so the ES module import resolves, and the game functions as designed (snake rendering, keyboard controls, game loop).

### User Scenarios
- **Scenario A (primary):** User visits the deployed Vercel URL, navigates to `/gameboy.html`, and the game fails to load. This is the default deployment target — any visitor sees a broken game.
- **Scenario B (development):** Developer opens `public/gameboy.html` locally via file:// protocol or a local dev server. The import from `../src/` works because the filesystem has `src/` at the project root.
- **Frequency:** Every time the site is accessed via the Vercel deployment. This is a 100% reproducible deployment-only bug.

---

## 2. Root Cause Analysis

### Why Does Current Behavior Exist?
The root cause is a **mismatch between the import path and the Vercel deployment structure**.

- **Development setup:** The project has `src/gameboy-snake-engine.js` at the project root. The `public/gameboy.html` file uses a relative ES module import: `import { ... } from '../src/gameboy-snake-engine.js'`. This works when served from a local dev server because the filesystem has the full project tree.

- **Vercel deployment:** Vercel serves the `public/` directory as the web root. Files outside `public/` (including `src/`) are **not** deployed to the server. The import `../src/gameboy-snake-engine.js` resolves to `https://.../src/gameboy-snake-engine.js`, which doesn't exist.

- **Vercel.json config:** The current `vercel.json` has no `buildCommand`, `rewrites`, or `redirects` configured. There is no mechanism to expose the `src/` directory.

- **Design oversight:** The design doc at `docs/DESIGN/5-gameboy-snake-game.md` planned the file structure correctly (`src/` for engine, `public/` for HTML) but did not account for the deployment constraint that `src/` content is inaccessible on Vercel unless explicitly handled.

### Why Change Now?
This is a P0 bug — the deployed game is completely broken. The import is the only integration point between the HTML shell and the game engine. Without it, the game does not function.

### Previous Constraints
- **No build step:** The project uses a zero-build approach (vanilla JS, no bundler). Vercel's `buildCommand: null` is intentional for simplicity.
- **File structure:** The engine was separated from the HTML specifically for testability (Vitest cannot import from inline scripts). This architectural decision is still valid and should be preserved.
- **ES module imports:** The design chose native ES module imports for modularity without a bundler. This is fine if the deployed paths resolve correctly.

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Game entry point | Import path change OR inline the engine |
| `src/gameboy-snake-engine.js` | Game engine | Possibly move to new location OR inline |
| `vercel.json` | Deployment config | Possibly add rewrites to serve `src/` |
| `tests/gameboy-snake.test.js` | Tests | Import path might need update if engine is moved |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `docs/DESIGN/5-gameboy-snake-game.md` | Design doc | May need deployment consideration update |
| `public/about.html` | About page | Contains link to `gameboy.html` (no change needed) |
| `README.md` | Documentation | May need note about deploy-specific import handling |

### Data Flow Impact
Currently:
```
gameboy.html (script type="module")
  └─ import '../src/gameboy-snake-engine.js'
       └─ exports: createInitialState, startGame, tick, etc.
       └─ used by: all game logic, rendering, input handling
```

The fix must preserve this data flow. The HTML depends on all exported functions. If the engine is moved or inlined, all exports must remain available.

### Documents to Update
- [ ] `docs/DESIGN/5-gameboy-snake-game.md` — add deployment section noting import path requirements
- [ ] `docs/PRD/11-gameboy-404.md` — this document (create)
- [ ] `docs/TASKS/11-gameboy-404.md` — task breakdown (create)
- [ ] `README.md` — optional, if deployment details change

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: Move engine into `public/src/`

- **Description:** Move `src/gameboy-snake-engine.js` to `public/src/gameboy-snake-engine.js`. Update the import path in `gameboy.html` from `'../src/gameboy-snake-engine.js'` to `'./src/gameboy-snake-engine.js'` (or `'/src/gameboy-snake-engine.js'`). Update test import paths accordingly.
- **Pros:**
  - Minimal code change (1 import path update, 1 file move)
  - Works immediately on Vercel — `public/` is the web root, so `/src/gameboy-snake-engine.js` becomes accessible
  - No Vercel config changes needed
  - Preserves ES module architecture and testability
  - Backward compatible for local dev
- **Cons:**
  - `src/` directory is no longer at project root level — some tooling might expect the standard `src/` convention
  - Test import paths from `../` change (need to update `tests/gameboy-snake.test.js`)
  - Creates a slight architectural inconsistency (`src/` under `public/`)
- **Risk:** Low — purely a path change
- **Effort:** ~15 minutes (file move + path updates + test update)

### Approach B: Add Vercel rewrites to serve `src/`

- **Description:** Add a `rewrites` rule in `vercel.json` to map `/src/*` to the actual file at `src/*` (outside `public/`). The import stays unchanged.
  ```json
  {
    "rewrites": [
      { "source": "/src/:path*", "destination": "/../src/:path*" }
    ]
  }
  ```
- **Pros:**
  - No file structure changes
  - No test import changes
  - Cleanest separation of concerns
- **Cons:**
  - **Vercel does not allow `../` in rewrites destinations** — rewrites can only route within the deploy directory (`public/`). This approach does NOT work with Vercel's zero-config deployment.
  - Would need a custom `vercel.json` builder or build step to copy `src/` into `public/`, adding complexity
  - Risk: Vercel-specific config that may break on other platforms
- **Risk:** High — may not work due to Vercel path resolution constraints
- **Effort:** Unknown — could require a full build pipeline to copy files

### Approach C: Inline engine code into `gameboy.html`

- **Description:** Move all game engine code from `src/gameboy-snake-engine.js` directly into a `<script>` block (non-module or module-inline) in `gameboy.html`. Remove the import entirely.
- **Pros:**
  - Zero file-serving issues — everything is in one HTML file
  - Fastest possible load (no additional HTTP request)
- **Cons:**
  - **Breaks testability** — Vitest cannot access inline script code, defeating the entire purpose of issue #5's architectural decision
  - Duplication: engine tests reference `src/gameboy-snake-engine.js`
  - Violates separation of concerns
  - Larger HTML file, harder to maintain
- **Risk:** Medium — introduces maintenance debt and breaks the testing architecture
- **Effort:** ~30 minutes (copy-paste + remove import + clean up)

### Recommendation
→ **Approach A** because: it's the simplest, lowest-risk fix that preserves the existing architecture (ES modules, testability, separation of concerns). Moving `src/gameboy-snake-engine.js` into `public/src/` is a minimal structural change that resolves the Vercel deployment issue without introducing any new dependencies or configuration complexity.

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. User navigates to `https://perfect-dev-agent-workflow.vercel.app/gameboy.html`
2. The game engine JS file loads successfully (HTTP 200, no console errors)
3. The canvas renders: background, grid, snake, food, score display
4. Keyboard arrow keys control snake direction
5. Game loop runs at ~150ms interval
6. Game-over and win states work correctly

### Edge Cases
1. **Local development (file:// protocol):** Some browsers block ES module imports from `file://` URLs. The local dev workflow may need a simple HTTP server (`npx serve` or `python -m http.server`). This is a pre-existing limitation, not introduced by this fix.
2. **Cache busting:** If `gameboy.html` is cached by CDN but the new JS file is at a different path, there might be a brief cache mismatch window. The import path change ensures old HTML can't resolve the old 404 path anyway.
3. **Module preload / race condition:** If the `<script type="module">` runs before the imported module finishes loading, the browser's module loader handles this correctly — ES modules are deferred by default.

### Failure Paths
1. **Network failure:** If the JS file fails to load due to CDN/network issues (unrelated to this fix), the game simply doesn't function. A `<noscript>` or inline fallback message could be added but is out of scope for this fix.
2. **Wrong import path after move:** If the import path doesn't match the new location (e.g., `./src/` vs `/src/`), the deployment still 404s. Must verify the exact resolved URL.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| Vercel deployment pipeline | Stable | Low — no config changes needed |
| `src/gameboy-snake-engine.js` | Stable | Low — file is already stable, just needs relocation |
| `public/gameboy.html` | In-flux | Low — import path update only |
| `tests/gameboy-snake.test.js` | Stable | Low — may need import path update if `src/` moves |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Issue #11 (this bug) | P0 — blocks all game deployment |
| Any deploy preview of gameboy.html | Blocked until fixed |
| Play-testing on deployed site | Blocked |

### Preparation Needed
- [ ] Verify the current Vercel deploy directory structure (confirm `src/` is excluded)
- [ ] Decide: move `src/` into `public/` or keep `src/` and adjust imports differently
- [ ] Update test import paths if engine moves

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer
Does Approach A (moving `src/gameboy-snake-engine.js` into `public/src/`) actually resolve the 404 on Vercel without breaking local development?

### Method
1. Create a local test: move `src/gameboy-snake-engine.js` to `public/src/gameboy-snake-engine.js`
2. Update the import in `public/gameboy.html` to `'./src/gameboy-snake-engine.js'`
3. Serve `public/` locally with a static HTTP server (`npx serve public/`)
4. Verify the game loads without 404
5. Check that tests still pass (update test import paths)

### Result
Spike result confirms the approach works. A static HTTP server serving `public/` correctly resolves `./src/gameboy-snake-engine.js` as long as the file exists within the served directory. The import path resolution is relative to the HTML file (not the server root), so `'./src/gameboy-snake-engine.js'` resolves to `{host}/src/gameboy-snake-engine.js`.

### Impact on Approach
No change to recommendation. Approach A is confirmed viable.
