# Design: Title Screen Commit Hash & Dev Menu

> Parent Issue: #56
> Phase: Plan
> Author: plan-agent
> Date: 2026-07-08

---

## 1. Overview

The game's title screen currently displays only the game name and instructions. This design adds:

1. **Commit hash display** — the abbreviated SHA of the deployed commit, shown on the title screen
2. **Dev menu** — an overlay accessible via a keypress on the title screen, showing recent commit metadata

### Goals

- Enable developers/QA to instantly verify which deployed version is running
- Provide easy access to changelog info (last commit message, author, date) without external tools
- Zero runtime dependencies — everything is baked in at build time or computed from static data
- Minimum code footprint, no new external dependencies

---

## 2. Architecture

### 2.1. System Layers

```
┌─────────────────────────────────────────────────────┐
│                   CI/CD (deploy.yml)                 │
│  sed replace __COMMIT_HASH__ → abc1234              │
│  sed replace __COMMIT_MSG__  → "fix: ..."           │
│  sed replace __COMMIT_AUTHOR__ → "devvi"            │
│  sed replace __COMMIT_DATE__ → "2026-07-08"         │
└──────────────┬──────────────────────────────────────┘
               │  (build-time injection via sed)
               ▼
┌─────────────────────────────────────────────────────┐
│              gameboy.html (static file)              │
│  <meta name="commit-hash" content="abc1234">        │
│  <meta name="commit-msg" content="fix: ...">        │
│  <meta name="commit-author" content="devvi">        │
│  <meta name="commit-date" content="2026-07-08">    │
└──────────────┬──────────────────────────────────────┘
               │  (read at runtime via DOM API)
               ▼
┌─────────────────────────────────────────────────────┐
│          Engine State (core.js)                      │
│  state.devMenuOpen: boolean                          │
│  state.commitInfo: { hash, msg, author, date }      │
└──────────────┬──────────────────────────────────────┘
               │  (passed to render)
               ▼
┌─────────────────────────────────────────────────────┐
│          Overlays (overlays.js)                      │
│  Title screen: bottom-right commit hash             │
│  Dev menu: full overlay with commit info            │
└─────────────────────────────────────────────────────┘
```

### 2.2. Build-Time Injection

The deploy pipeline (`deploy.yml`) already runs `git checkout` and `actions/checkout@v6`. A `sed` step before Vercel deployment will replace placeholder strings in `gameboy.html` with real `git` metadata.

**Placeholder format:** `__COMMIT_HASH__`, `__COMMIT_MSG__`, `__COMMIT_AUTHOR__`, `__COMMIT_DATE__`

**Injection commands:**
```bash
sed -i "s/__COMMIT_HASH__/$(git rev-parse --short HEAD)/" public/gameboy.html
sed -i "s/__COMMIT_MSG__/$(git log -1 --pretty=%s | sed 's/\//\\\//g')/" public/gameboy.html
sed -i "s/__COMMIT_AUTHOR__/$(git log -1 --pretty=%an)/" public/gameboy.html
sed -i "s/__COMMIT_DATE__/$(git log -1 --format=%ad --date=short)/" public/gameboy.html
```

**Fallback for local development:** If placeholders are not replaced (i.e., file is opened directly from filesystem), the game should detect the raw `__COMMIT_HASH__` string (or missing meta tags) and display a `local` / `dev` fallback.

### 2.3. Runtime Data Flow

```
gameboy.html (DOM)                    Engine State                    Renderer
┌──────────────┐     read meta tags    ┌──────────────┐    draw text    ┌─────────────┐
│ <meta ...>   │ ──────────────────→  │ commitInfo   │ ─────────────→ │ Title screen │
│ keydown evt  │ ──────────────────→  │ devMenuOpen  │ ─────────────→ │ Dev menu     │
└──────────────┘                      └──────────────┘                └─────────────┘
```

---

## 3. Module Design

### 3.1. `public/gameboy.html` — Embed commit metadata + dev menu keybinding

**Changes:**
1. Add `<meta>` tags near the top of `<head>` (after existing `<title>`):
   ```html
   <meta name="commit-hash" content="__COMMIT_HASH__">
   <meta name="commit-msg" content="__COMMIT_MSG__">
   <meta name="commit-author" content="__COMMIT_AUTHOR__">
   <meta name="commit-date" content="__COMMIT_DATE__">
   ```

2. In the module script, after `init()`:
   - Read the meta tags and populate `state.commitInfo`
   - Add event listener for dev menu key (backtick `` ` `` = `Backquote` key)
   - Also wire Escape to close dev menu

3. New event handling in `keydown` listener (title state only):
   - `` ` `` (Backquote): toggle `state.devMenuOpen`
   - Escape: close `state.devMenuOpen`

4. Dev menu accessible during: `title` state (and optionally `paused` state)

### 3.2. `public/src/engine/core.js` — State changes

**New state fields in `createInitialState()`:**
```js
commitInfo: {
  hash: 'dev',       // fallback if __COMMIT_HASH__ not replaced
  msg: 'Development build',
  author: 'local',
  date: new Date().toISOString().split('T')[0],
},
devMenuOpen: false,
```

**New helper function:**
```js
export function updateCommitInfo(state, info) {
  return { ...state, commitInfo: { ...state.commitInfo, ...info } };
}
```

**New helper function:**
```js
export function toggleDevMenu(state) {
  // Only toggles when on title screen
  if (state.gameState !== 'title') return state;
  return { ...state, devMenuOpen: !state.devMenuOpen };
}
```

### 3.3. `public/src/render/overlays.js` — Rendering commit hash + dev menu

**Changes to `renderTitleScreen()`:**
- After existing title content, add a small commit hash text at bottom-right:
  ```js
  // Commit hash (bottom-right)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  ctx.font = '8px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(state.commitInfo.hash, CANVAS_SIZE - 8, CANVAS_SIZE - 8);
  ```

**New function `renderDevMenu(ctx, state)`:**
- Full-screen overlay (semi-transparent dark background)
- Title: "DEV MENU"
- Fields displayed:
  - Commit Hash: `abc1234`
  - Commit Message: truncated to 60 chars per line, wrapped if needed
  - Author: `devvi`
  - Date: `2026-07-08`
- Close hint at bottom: "Press ` to close"

**Modified `renderOverlay()`:**
- After `renderTitleScreen()`, check `state.devMenuOpen`:
  ```js
  if (state.devMenuOpen) {
    renderDevMenu(ctx, state);
  }
  ```

### 3.4. `.github/workflows/deploy.yml` — CI/CD injection

**Add step before Vercel deploy:**
```yaml
- name: Inject commit metadata
  run: |
    sed -i "s/__COMMIT_HASH__/$(git rev-parse --short HEAD)/" public/gameboy.html
    sed -i "s/__COMMIT_MSG__/$(git log -1 --pretty=%s | sed 's/\//\\\//g')/" public/gameboy.html
    sed -i "s/__COMMIT_AUTHOR__/$(git log -1 --pretty=%an)/" public/gameboy.html
    sed -i "s/__COMMIT_DATE__/$(git log -1 --format=%ad --date=short)/" public/gameboy.html
```

---

## 4. UI Layout (Text Description)

### Title Screen (modified)

```
┌──────────────────────────────────┐
│          🐍 SNAKE                │
│        METROIDVANIA              │
│                                  │
│    Explore. Fight. Eat. Grow.    │
│                                  │
│     ⬆ ⬇ ⬅ ➡  Move             │
│     Z  Fire projectile           │
│     X  Interact (gacha/save)     │
│     ENTER  Start game            │
│                                  │
│       PRESS ENTER TO START       │
│                                  │
│                          abc1234 │  ← commit hash (dim, bottom-right)
└──────────────────────────────────┘
```

### Dev Menu Overlay

```
┌──────────────────────────────────┐
│          ⚙ DEV MENU              │
│                                  │
│  Commit Hash:  abc1234           │
│  Commit Msg:   fix: ...          │
│  Author:       devvi             │
│  Date:         2026-07-08         │
│                                  │
│                                  │
│        Press ` to close          │
└──────────────────────────────────┘
```

---

## 5. Edge Cases

| Edge Case | Behavior |
|-----------|----------|
| Placeholder not replaced (local dev) | Fallback to `dev` hash; msg = "Development build"; author = "local"; date = today |
| Commit message contains special chars (`, `'`, `/`) | `sed` uses `|` delimiter instead of `/` and escapes single quotes |
| Very long commit message | Truncate at 60 chars per line, auto-wrap |
| Dev menu opened during playing state | Blocked — only available on title screen |
| Mobile / touch | No keypress available → dev menu not shown; commit hash still visible |
| Multiple rapid backtick presses | Toggle is idempotent; no side effects |
| Commit message contains `__COMMIT_` -like strings | Fallback detection checks raw placeholder string presence, not substring match |

---

## 6. Test Specifications

### 6.1. Unit Tests — `tests/metroidvania-snake.test.js`

**New test suite: Dev Menu & Commit Hash**

| # | Test Case | What to Verify |
|---|-----------|----------------|
| T1 | `commitInfo` exists in initial state | `createInitialState()` returns state with `commitInfo.hash`, `.msg`, `.author`, `.date` |
| T2 | `commitInfo` defaults to `dev` | When no meta tags are read, hash is `'dev'` |
| T3 | `toggleDevMenu` toggles `devMenuOpen` | Calling `toggleDevMenu` on title state flips `devMenuOpen` from false→true and true→false |
| T4 | `toggleDevMenu` blocked in non-title state | Calling `toggleDevMenu` on playing/paused/gameover state does NOT change `devMenuOpen` |
| T5 | `updateCommitInfo` merges correctly | Passing `{ hash: 'abc1234' }` updates only hash, preserves other fields |
| T6 | Title screen rendering includes hash | `renderTitleScreen` is called and `ctx.fillText` is invoked with `state.commitInfo.hash` (mock ctx) |
| T7 | Dev menu renders when `devMenuOpen` is true | `renderDevMenu` is called by `renderOverlay` when `state.devMenuOpen === true` |
| T8 | Meta tag reading (integration) | DOM meta tags are correctly read into `commitInfo` object |

### 6.2. Mock Strategy

For canvas rendering tests:
- Create a minimal mock `ctx` object with `fillText`, `font`, `fillStyle`, `textAlign`, `fillRect`, `save`, `restore` stub functions
- Run the render functions and verify correct methods are called with expected arguments (or just that no errors occur)

### 6.3. CI/CD Test

- **Inject test:** On a throw-away branch, run the `sed` commands manually; verify `gameboy.html` contains actual commit hash and no raw `__COMMIT_HASH__` placeholder
- **Vercel preview:** Deploy preview should show proper hash on title screen

---

## 7. Files Changed

| File | Change Type | Risk |
|------|-------------|------|
| `public/gameboy.html` | Modify (meta tags + keybind + init logic) | 🟢 Low |
| `public/src/engine/core.js` | Modify (state fields + helpers) | 🟢 Low |
| `public/src/render/overlays.js` | Modify (hash display + dev menu render) | 🟢 Low |
| `.github/workflows/deploy.yml` | Modify (sed injection step) | 🟡 Medium |
| `tests/metroidvania-snake.test.js` | Add tests (8 new test cases) | 🟢 Low |

---

## 8. Future Considerations (Post-MVP)

- Dev menu showing FPS counter, debug hitbox overlay
- Dev menu showing game state dump (all state fields)
- Dev menu showing diff stats (files changed, +/- lines) from last commit
- Dev menu showing CI build number / deploy timestamp
- Touch-screen friendly: 5-tap on commit hash to open dev menu
- QR code on title screen linking to commit on GitHub
