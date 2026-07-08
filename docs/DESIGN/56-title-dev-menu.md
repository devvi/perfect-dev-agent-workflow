# Design: Title Screen — Deploy Commit Hash & Dev Menu

> Parent Issue: #56
> Plan Agent: subagent
> Date: 2026-07-08

---

## 1. Architecture Overview

The feature involves three architectural layers:

```
┌─────────────────────────────────────────────────┐
│ Build-Time (CI/CD)                              │
│  .github/workflows/deploy.yml                   │
│  → sed replaces __COMMIT_HASH__ placeholder     │
│  → sed replaces __COMMIT_MSG__/__COMMIT_AUTHOR__│
│  → embeds build metadata into static HTML       │
└──────────────────────┬──────────────────────────┘
                       │ static file with baked-in metadata
                       ▼
┌─────────────────────────────────────────────────┐
│ Runtime (Browser)                                │
│  gameboy.html (entry point + input handling)     │
│  core.js (game state — devMenuOpen flag)          │
│  renderer.js (dispatch to overlay)               │
│  overlays.js (title screen + dev menu rendering)  │
└─────────────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────┐
│ Presentation (Canvas)                            │
│  Title screen canvas overlay                     │
│    │  - Game title, controls help                │
│    │  - Commit hash (bottom-right corner)        │
│    └── Dev Menu overlay (on toggle)              │
│         - Full SHA, commit message, author, date │
└─────────────────────────────────────────────────┘
```

### Module Breakdown

| Layer | Module | File | Role |
|-------|--------|------|------|
| Build | CI/CD Pipeline | `.github/workflows/deploy.yml` | Injects git metadata into HTML at deploy time |
| Runtime | Entry Point | `public/gameboy.html` | Loads modules; holds dev menu key listener; exposes commit metadata to canvas |
| Runtime | Game State | `public/src/engine/core.js` | Manages `devMenuOpen` boolean in game state |
| Runtime | Render Dispatch | `public/src/render/renderer.js` | Passes dev menu state to overlay renderer |
| Runtime | Overlay Renderer | `public/src/render/overlays.js` | Renders title screen hash + dev menu overlay text |
| Static | Landing Page | `index.html` | May show commit hash for consistency (lowest priority) |

---

## 2. Component/Module Design

### 2.1 Build-Time Injection (deploy.yml)

**Purpose:** Replace compile-time placeholders with live git metadata before deploying the static site.

**Placeholders (defined in `gameboy.html`):**

| Placeholder | Injected Value | Example |
|-------------|---------------|---------|
| `__COMMIT_HASH__` | `git rev-parse --short HEAD` (7 chars) | `a1b2c3d` |
| `__COMMIT_MSG__` | `git log -1 --pretty=%s` (first line) | `fix: prevent snake overflow` |
| `__COMMIT_AUTHOR__` | `git log -1 --pretty=%an` | `devvi` |
| `__COMMIT_DATE__` | `git log -1 --pretty=%cd --date=short` | `2026-07-08` |

**Injection script (new step in deploy.yml):**
```
After checkout, before Vercel deploy:
  - Run sed to replace __COMMIT_*__ placeholders in public/gameboy.html
  - Use git log to extract the last commit metadata from HEAD
  - Fallback: if placeholder remains unset → display "local" / "dev"
```

**Place to inject placeholders in `gameboy.html`:**
A `<meta>` tag or inline `<script>` block that holds the metadata as a JS object literal, accessible at runtime without DOM queries.

### 2.2 Commit Metadata Block (gameboy.html)

**Design:** A small inline script block immediately before the module import, containing a plain JS object:

```
<script>
  window.__COMMIT_INFO = {
    hash: "__COMMIT_HASH__",
    message: "__COMMIT_MSG__",
    author: "__COMMIT_AUTHOR__",
    date: "__COMMIT_DATE__"
  };
</script>
```

This block is the ONLY place that contains placeholder strings. The build script replaces all four at once. At runtime, any module can access `window.__COMMIT_INFO` to read the metadata.

**Fallback behavior:**
If `window.__COMMIT_INFO.hash` starts with `__` (i.e., placeholder not replaced — running from local filesystem without CI), the system should display "local" as the hash and show "Local development build" in the dev menu.

### 2.3 Game State (core.js)

**New state fields:**

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `devMenuOpen` | boolean | `false` | Whether the dev menu overlay is visible |
| `commitInfo` | object | `null` | Reference to `window.__COMMIT_INFO` (read-only) |

**State transitions for devMenuOpen:**
- Title screen + key press (backtick) → devMenuOpen = true
- Dev menu + key press (backtick or Escape or Enter) → devMenuOpen = false
- Dev menu + game starts (Enter/Space/Arrow) → devMenuOpen = false (auto-close when starting game)
- Dev menu + game state changes to playing → devMenuOpen = false (cleanup)

### 2.4 Input Handling (gameboy.html keydown listener)

**New keybinding:** Backtick / Grave accent (`` ` ``) key — `e.code === 'Backquote'`

**Logic:**
```
If state.gameState === 'title':
  If key is Backquote:
    toggle state.devMenuOpen
    render immediately
    prevent default
    return early (don't start game)
  Else if key is Enter/Arrow (normal title handling):
    if state.devMenuOpen:
      close dev menu
    start game
```

### 2.5 Title Screen Rendering (overlays.js)

**Modified `renderTitleScreen()`:**

Current rendering draws a dark overlay with title, instructions, and "PRESS ENTER TO START". The commit hash should be drawn after all existing content.

**Commit hash rendering:**
- Position: Bottom-right corner of the canvas, near `(CANVAS_SIZE - 10, CANVAS_SIZE - 10)`
- Font: 9px monospace, semi-transparent color (e.g., `rgba(255, 255, 255, 0.3)`)
- Visual: `@ a1b2c3d` — prefixed with `@` for clarity
- Responsibility: `renderTitleScreen()` reads `state.commitInfo.hash` and draws the text
- Fallback: If hash starts with `__` or is falsy → draw `@ local`

**Dev menu activation hint (subtle):**
- Bottom-left corner: small text `backtick for dev`
- Same style as commit hash, semi-transparent
- Helps testers discover the dev menu

### 2.6 Dev Menu Rendering (overlays.js)

**New function: `renderDevMenu(ctx, state)`**

Called from `renderOverlay()` when `state.devMenuOpen === true`.

**Visual design:**
- Semi-transparent dark overlay (same style as pause screen: `rgba(10, 10, 26, 0.85)`)
- Centered panel with border (pseudo-box using filled rectangle + outline)
- Title: "DEV MENU" in gold
- Key-value list:
  ```
  Commit   : a1b2c3d
  Message  : fix: prevent snake overflow
  Author   : devvi
  Date     : 2026-07-08
  Active PR: #55 (if detectable)
  ```
- Font: 10px monospace, aligned left, with `:` separator
- Close hint at bottom: "Press ` or ESC to close"
- If any field is missing/fallback → display "N/A"

**Layout math:**
```
Panel width:  300px  (centered: x=50)
Panel height: 180px  (centered: y=110)
Title:        y=140
Field 1:      y=170
Field 2:      y=190
Field 3:      y=210
Field 4:      y=230
Close hint:   y=270
```

### 2.7 Render Dispatch (renderer.js)

**Modified `render()`:**

After `renderOverlay(ctx, state)`, the dev menu is already handled because the overlay function checks for devMenuOpen. No separate dispatch needed.

**But:** The commit hash must be drawn as part of the title screen, not as a separate layer. Since `renderTitleScreen()` already draws the title overlay, adding the commit hash inside that function is the cleanest approach — no changes to `renderer.js` dispatch flow.

### 2.8 Landing Page (index.html)

**Low priority:** Optionally show the commit hash as a subtitle or in the footer. The page is a simple redirect to `gameboy.html`, so this is cosmetic.

---

## 3. Data Flow

### Build-Time Injection Flow

```
developer pushes to master
         │
         ▼
deploy.yml triggered (filters for workflow/implement label)
         │
         ▼
actions/checkout@v6  ← we are at HEAD of master
         │
         ▼
Step: "Inject commit metadata"
  HASH=$(git rev-parse --short HEAD)
  MSG=$(git log -1 --pretty=%s)
  AUTHOR=$(git log -1 --pretty=%an)
  DATE=$(git log -1 --pretty=%cd --date=short)
         │
         ▼
  sed -i "s/__COMMIT_HASH__/$HASH/g" public/gameboy.html
  sed -i "s/__COMMIT_MSG__/$MSG/g" public/gameboy.html
  sed -i "s/__COMMIT_AUTHOR__/$AUTHOR/g" public/gameboy.html
  sed -i "s/__COMMIT_DATE__/$DATE/g" public/gameboy.html
         │
         ▼
amondnet/vercel-action → deploys modified gameboy.html
```

### Runtime Rendering Flow

```
Page Load
  │
  ▼
Inline script sets window.__COMMIT_INFO = { hash, message, ... }
  │
  ▼
init()
  │  state = createInitialState(world)
  │  state.commitInfo = window.__COMMIT_INFO || fallback
  ▼
render(ctx, state)
  │
  ├─ renderRoom()         ← game world
  ├─ renderHUD()          ← score/length
  ├─ renderMinimap()      ← map
  ├─ renderOverlay()      ← title/gameover/won/paused/dev
  │    │
  │    └─ renderTitleScreen()
  │         ├─ dark overlay
  │         ├─ title text
  │         ├─ controls info
  │         ├─ "PRESS ENTER TO START"
  │         └─ commit hash text (bottom-right)
  │
  └─ renderScanlines()
  │
  ▼
User presses Backquote
  │
  ▼
keydown listener:
  → state.devMenuOpen = !state.devMenuOpen
  → render(ctx, state)   ← immediate re-render
  │
  ▼
renderOverlay() → state.devMenuOpen === true
  → renderDevMenu(ctx, state) ← draws overlay with commit metadata

User presses Backquote / Escape / Enter again
  → state.devMenuOpen = false
  → render(ctx, state)   ← title screen without dev menu
```

---

## 4. Test Specifications

This section describes **what** to test, not how to implement tests.

### 4.1 Unit Test Scenarios (Logic, no rendering)

#### Group A: Fallback Behavior (P0)

| ID | Scenario | Input / Setup | Expected Behavior |
|----|----------|--------------|-------------------|
| A1 | All placeholders intact (local dev) | `window.__COMMIT_INFO.hash === "__COMMIT_HASH__"` | Display shows "local" not the raw placeholder string |
| A2 | Partial replacement | `window.__COMMIT_INFO.hash = "abc1234"` but `message` still contains `__COMMIT_MSG__` | Hash shows "abc1234", message shows "N/A" |
| A3 | Metadata object missing entirely | `window.__COMMIT_INFO` is undefined/null | All fields show fallback values ("N/A", "local") |

#### Group B: State Management (P0)

| ID | Scenario | Input / Setup | Expected Behavior |
|----|----------|--------------|-------------------|
| B1 | Dev menu toggle on title screen | Title state, press Backquote | `state.devMenuOpen` becomes `true` |
| B2 | Dev menu toggle off | Dev menu open, press Backquote again | `state.devMenuOpen` becomes `false` |
| B3 | Dev menu auto-close on game start | Dev menu open, press Enter | `state.devMenuOpen` resets to `false`, game starts |
| B4 | Dev menu auto-close on Escape | Dev menu open, press Escape | `state.devMenuOpen` becomes `false` |
| B5 | Dev menu not available in playing state | Playing state, press Backquote | `devMenuOpen` should not change (or silently ignored) |
| B6 | Dev menu not available in gameover state | Game over, press Backquote | `devMenuOpen` should not change |
| B7 | Dev menu not available in paused state | Paused, press Backquote | `devMenuOpen` should not change |

#### Group C: Input Handling (P0)

| ID | Scenario | Input / Setup | Expected Behavior |
|----|----------|--------------|-------------------|
| C1 | Backquote does not interfere with game controls | Playing state, press Backquote | Normal game controls unaffected |
| C2 | Backquote does not start the game | Title screen, press Backquote | Game does not start, only dev menu toggles |
| C3 | Starting game while dev menu open | Dev menu open, press Enter | Both dev menu closes + game starts |
| C4 | Enter from dev menu | Dev menu open, press Enter | Game starts normally (dev menu + start sequence) |

#### Group D: Title Screen Hash Rendering (P1)

| ID | Scenario | Setup | Expected Behavior |
|----|----------|-------|-------------------|
| D1 | Hash displayed on title | Title state with valid commit hash | Hash text is rendered at bottom-right region |
| D2 | Hash format | Valid short SHA (7 chars) | Format matches `@ abc1234` pattern |
| D3 | Hash position | Title state | Hash is below all other title content, near bottom edge |
| D4 | Hash with long SHA | 40-char full SHA | Render first 7 chars only (abbreviated) |

#### Group E: Dev Menu Content (P1)

| ID | Scenario | Setup | Expected Behavior |
|----|----------|-------|-------------------|
| E1 | Dev menu shows all fields | Valid commit metadata | Hash, message, author, date all visible |
| E2 | Dev menu with long message | Message > 60 characters | Message wraps/truncates to fit panel width |
| E3 | Dev menu with special characters | Author name has Unicode or spaces | Rendered correctly, no rendering breakage |
| E4 | Dev menu layout | All fields populated | Fields are left-aligned, colon-separated, properly spaced |

#### Group F: Build Injection (P1)

| ID | Scenario | Input / Setup | Expected Behavior |
|----|----------|--------------|-------------------|
| F1 | sed replaces hash | `__COMMIT_HASH__` in `gameboy.html` | After `sed`, placeholder is replaced with actual short SHA |
| F2 | sed replaces message | `__COMMIT_MSG__` in `gameboy.html` | Message placeholder replaced with commit subject |
| F3 | sed handles special characters | Commit message contains `/`, `&`, `\n` | sed does not fail; placeholder replaced |
| F4 | Multiple placeholder occurrences | Multiple `__COMMIT_HASH__` in file | All occurrences replaced (not just first) |
| F5 | Deploy with no metadata | Fresh checkout, no HEAD commit (edge case) | Pipeline handles gracefully, game still deploys with fallback values |

### 4.2 Integration & Play-Test Scenarios

| ID | Scenario | Steps | Expected |
|----|----------|-------|----------|
| I1 | Full flow: local dev | Open `gameboy.html` directly from filesystem | Shows "local" hash, Backquote toggles dev menu with "Local development build" |
| I2 | Full flow: deployed | Visit production URL | Shows real commit hash, dev menu contains real commit data |
| I3 | Mobile tap activation (optional) | Tap commit hash text 5 times rapidly | Dev menu opens (if implemented) |
| I4 | Canvas resize / different screen | Render at different canvas sizes | Text is visible and not clipped |

### 4.3 Edge Cases

| ID | Edge Case | Expected Handling |
|----|-----------|-------------------|
| EC1 | Commit hash from merge commit | Shows merge commit's SHA (from HEAD, which is the merge commit) — acceptable |
| EC2 | Empty commit message | Shows "(no message)" or empty line in dev menu |
| EC3 | Multiple rapid Backquote presses | Toggle works idempotently: odd press = open, even press = close |
| EC4 | Dev menu + gamepad input | No conflict; gamepad not currently supported |
| EC5 | Browser tab hidden during dev menu | Re-render on visibility change preserves devMenuOpen state |

---

## 5. Dependencies & Risks

| Dependency | Risk | Mitigation |
|-----------|------|------------|
| `deploy.yml` must run v6 or newer of `actions/checkout` | Low — already using v6 | N/A |
| `sed` command syntax (special chars in message) | Low | Use sed with different delimiter or escape; test with sample messages |
| Canvas `fillText` text wrapping | Low | Manual line calculation; no layout engine needed |
| Browser support for inline `window.__COMMIT_INFO` | None — standard JS | N/A |

**No external libraries or build tools are required.** The feature is pure vanilla JS + shell script.

---

## 6. Non-Goals & Future Considerations

| Topic | Status | Notes |
|-------|--------|-------|
| Dev menu showing diff stats (+/- lines per file) | Post-MVP | Would need `git diff HEAD~1 --stat` at build time |
| Dev menu showing CI build number | Post-MVP | Requires environment variable injection from CI |
| Dev menu with FPS/debug overlays | Post-MVP | Possible future enhancement |
| Dev plugin system | Post-MVP | Would allow developer-extendable panels |
| Mobile device dev menu via touch | Post-MVP | Tap-detection or on-screen button — not critical for MVP |
