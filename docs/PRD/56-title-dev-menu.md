# Research: Title Screen — Deploy Commit Hash & Dev Button

> Parent Issue: #56
> Agent: research-agent
> Date: 2026-07-08
> Status: Open
> Priority: Medium

---

## 1. Problem Definition

### Current Behavior
The title screen (gameboy.html) is a minimal dark landing page with the game title "🐍 银河蛇" and a meta-refresh redirect to `/gameboy.html`. The game itself does not display any deployment information (commit hash, version, build date). There is no developer menu or debugging interface.

### Expected Behavior
1. The game's title screen (when `state.gameState === 'title'`) should display the currently deployed commit hash (e.g., `abc1234` — abbreviated SHA).
2. The title screen should have a hidden/easter-egg developer button that, when activated (e.g., a specific key press or visible button), opens a **dev menu** overlay.
3. The dev menu should show the last commit's change summary (commit message, author, date, files changed).

### User Scenarios
- **Scenario A (Developer / QA):** Developer deploys a new build, opens the game, sees the commit hash on the title screen, instantly confirming which version is live. They activate dev menu to verify the latest changes are deployed.
- **Scenario B (Player reports a bug):** A player shares a screenshot of the title screen, and the commit hash helps the dev team immediately identify which build is affected.
- **Scenario C (CI/CD pipeline verification):** The deploy script embeds the commit hash into the build artifact, and the title screen reads it to prove the pipeline is working end-to-end.

---

## 2. Root Cause Analysis (Bug) / Design Intent (Feature)

### Why Does Current Behavior Exist?
The title screen was a minimal MVP, focused on redirecting to the game. There was no prior requirement to expose deployment metadata or developer tooling in the UI.

### Why Change Now?
As the project grows with multiple features, issues, and deploy cycles, it becomes critical to know which commit is running on any given deployment. The dev menu serves dual purposes:
- **Debugging:** Quickly verify that a fix or feature is included in the current deploy.
- **Player transparency:** Developers / testers can confirm the deployed version without checking external systems.

### Previous Constraints
- Must keep the game a single-page application in `gameboy.html`
- No external dependencies (vanilla JS, inline CSS)
- Canvas-based rendering; the title screen is rendered by the game engine on canvas, not as DOM elements

---

## 3. Impact Analysis

### Directly Affected Modules
| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Game UI / Input Handling | Embed commit hash at build time; add dev menu toggle key; render dev menu overlay |
| `.github/workflows/deploy.yml` | CI/CD Pipeline | Inject commit hash into `gameboy.html` during build (e.g., via `sed` or env substitution) |

### Indirectly Affected Modules
| File | Module | Why Affected |
|------|--------|--------------|
| `src/engine/core.js` | Game State | May need a `devMenuOpen` flag in state |
| `src/render/renderer.js` | Renderer | May need to render dev menu overlay text on canvas |
| `index.html` | Landing Page | May also display commit hash for consistency |
| `README.md` | Documentation | Update to mention the dev menu feature |

### Data Flow Impact
#### Commit Hash Display (Title Screen)
```
Build time: deploy.yml → sed replaces __COMMIT_HASH__ placeholder in gameboy.html
Runtime:    DOM or game state reads the embedded hash → canvas text render
```

#### Dev Menu
```
User press key (e.g., 'D' or '`') → state.devMenuOpen = true
Renderer draws dev menu overlay (commit msg, author, date)
User press same key again or Escape → state.devMenuOpen = false
```

### Documents to Update
- [ ] `docs/PRD/56-title-dev-menu.md` (本文件)
- [ ] `docs/TASKS/56-title-dev-menu.md` (Plan 阶段创建)
- [ ] `docs/DESIGN/56-title-dev-menu.md` (Plan 阶段)

---

## 4. Solution Comparison

> At least 2 approaches required.

### Approach A: Commit Hash via Build-time Injection + Dev Menu via Keybind
- **Description:** Use the CI/CD deploy workflow (`deploy.yml`) to replace a placeholder like `__COMMIT_HASH__` in `gameboy.html` with the actual short SHA before deploying. On the title screen, render the hash as text (e.g., bottom-right corner). Add a keybind (e.g., press backtick/grave accent `` ` `` or KeyD) to toggle the dev menu, which is rendered as a canvas overlay.
- **Pros:**
  - No runtime API calls — hash is baked into the static file
  - Works on any static host (Vercel, GitHub Pages, etc.)
  - Dev menu is a lightweight canvas overlay, no new DOM elements
  - Easy to test locally (manual replace of placeholder)
- **Cons:**
  - Requires CI/CD pipeline modification
  - Hash is fixed at deploy time — won't update if the file is cached
- **Risk:** Low — well-understood pattern
- **Effort:** Small (~2–3 hours)

### Approach B: Runtime API Fetch (GitHub API)
- **Description:** At runtime during the title screen, fetch the latest commit info from the GitHub API (unauthenticated) using the `devvi/perfect-dev-agent-workflow` repo. Parse the response to get the commit hash and message.
- **Pros:**
  - No build-time injection needed
  - Always shows the latest commit (not just the deploy commit)
  - Works without modifying CI/CD
- **Cons:**
  - Requires network request — fails offline or on rate-limit
  - Adds latency to the title screen load
  - Exposes repo info to all players (unnecessary)
  - GitHub API rate limit for unauthenticated requests is low (60/hr)
- **Risk:** Medium — network dependency, rate limit
- **Effort:** Medium (~3–4 hours)

### Approach C: Vercel Deploy Hook / Server-side Injection
- **Description:** Instead of build-time injection, use Vercel's serverless functions (or a small backend) to serve the commit hash from environment variables set during deploy. The game fetches `/api/version` to get the hash.
- **Pros:**
  - Clean separation of build and runtime
  - Hash lives in environment, not in source code
- **Cons:**
  - Introduces a backend dependency (breaks static hosting simplicity)
  - Network request latency
  - Over-engineering for a simple feature
  - The project currently has no backend
- **Risk:** High — introduces new infrastructure
- **Effort:** High (~5–8 hours)

### Recommendation
→ **Approach A** because:
1. Zero runtime dependencies — the hash is static at deploy time
2. Simplest and most maintainable for a small project
3. The CI/CD pipeline already exists (`.github/workflows/deploy.yml`), so adding a sed command is trivial
4. The dev menu can be a pure canvas overlay, consistent with the game rendering approach

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path
1. **Title screen shows commit hash:** On first load (state.gameState === 'title'), the abbreviated commit hash is visible (e.g., bottom-right of the game canvas or next to the title).
2. **Dev menu activation:** Player presses a designated key (e.g., backtick/grave accent `` ` `` or `D`) during the title screen → dev menu overlay appears.
3. **Dev menu content:** Shows SHA, commit message, author, date of the last commit.
4. **Dev menu dismissal:** Press the same key again, or press Escape → dev menu closes.
5. **Build-time injection:** Running `deploy.yml` on `main` replaces `__COMMIT_HASH__` placeholder with the actual short SHA.

### Edge Cases
1. **Placeholder not replaced (local dev):** If `__COMMIT_HASH__` is not replaced (e.g., opened directly from the filesystem), the display should show a fallback like `dev` or `local` rather than showing the raw placeholder.
2. **Multiple dev menu states:** The dev menu should not interfere with other game states (playing, paused, game over). If opened during playing, it should pause the game or be blocked.
3. **Keybinding conflict:** Ensure the dev menu key doesn't conflict with existing game controls (arrows, Z, X, Enter, Shift, Space). Prefer a low-conflict key like backtick (`` ` ``), F1, or a chord (Ctrl+D).
4. **Mobile devices:** On mobile/touch, the dev menu should be accessible via an invisible hit zone (e.g., tap the commit hash text 5 times) or a dedicated on-screen debug toggle.

### Failure Paths
1. **Deploy script fails to inject:** If the `sed` command fails, the commit hash placeholder remains unmodified. The game should gracefully fall back to `unknown` or `local`.
2. **Commit message is very long:** The dev menu should truncate long messages (e.g., max 60 chars per line, wrap to multiple lines).
3. **Canvas redraw reset:** If the game re-initializes (init()), the dev menu overlay state should be preserved or gracefully reset.

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On
| Dependency | Status | Risk |
|------------|--------|------|
| `.github/workflows/deploy.yml` | Stable | Low — just needs one extra `sed` step |
| Canvas rendering (`renderer.js`) | Stable | Low — text rendering on canvas is basic `fillText` |
| Game state management (`core.js`) | Stable | Low — adding a `devMenuOpen` boolean |

### Blocks
| Future Work | Priority |
|-------------|----------|
| Dev menu showing diff stats (files changed, +/- lines) | Optional (Post-MVP) |
| Dev menu showing CI build number / deploy timestamp | Optional (Post-MVP) |
| Dev menu with toggle-able debug overlays (hitboxes, FPS) | Optional (Post-MVP) |

### Preparation Needed
- [ ] Review `deploy.yml` for injection point
- [ ] Confirm placeholder syntax (`__COMMIT_HASH__`) doesn't conflict with existing templating

---

## 7. Spike / Experiment (Optional)

### Build-time injection test
```bash
# Quick test to verify sed injection works
echo '<meta name="commit" content="__COMMIT_HASH__">' > /tmp/test.html
sed -i "s/__COMMIT_HASH__/$(git rev-parse --short HEAD)/" /tmp/test.html
cat /tmp/test.html
# Expected: <meta name="commit" content="abc1234">
```
This confirms the injection approach works without modifying the actual deploy pipeline. The real injection will be added to `deploy.yml`.
