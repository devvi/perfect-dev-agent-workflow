# Design: Mobile Support — Gyroscope + Touch Controls

> Parent Issue: #102
> Date: 2026-07-10
> Stage: Plan

---

## Architecture Overview

The mobile support system adds three new input channels alongside existing keyboard input:

```
                    ┌─────────────────────────────────┐
                    │      mobile-input-controller     │
                    │  (added to public/gameboy.html)  │
                    │                                  │
Keyboard ───────────┤  keydown handler (unchanged)     │
                    │                                  │
Gyroscope ──────────┤  deviceorientation handler ──────┤──► changeDirection()
(Tilt)              │  (low-pass filtered)             │
                    │                                  │
Touch Z/X Buttons ──┤  touchstart/touchend handlers ──┤──► fire() / interact()
                    │                                  │
Touch Swipe ────────┤  touchstart/touchmove handler ───┤──► changeDirection()
(Fallback)          │  (only when gyro unavailable)    │
                    └─────────────────────────────────┘
```

**Key Principle:** All input channels converge into the same engine API (`changeDirection`, `fire`, `interact`). The game core (`core.js`, `engine/`) remains completely unchanged.

---

## Component Design

### 1. Responsive Canvas Layout

**File:** `public/gameboy.html` (CSS)

The canvas is 400×400 native resolution. On mobile, we CSS-scale it to fit the viewport:

```css
/* Existing */
canvas#game { display: block; border: 3px solid #16213e; image-rendering: pixelated; }

/* Add for mobile */
body.mobile .game-wrapper {
  max-width: 100vw;
  max-height: calc(100dvh - 120px); /* leave room for score bar + buttons */
  aspect-ratio: 1 / 1;
}
body.mobile canvas#game {
  width: 100%;
  height: 100%;
}
```

Detection: `'ontouchstart' in window || navigator.maxTouchPoints > 0` + optional manual toggle.

### 2. Gyroscope Direction Control

**File:** `public/gameboy.html` (JavaScript)

```js
class GyroscopeController {
  constructor() {
    this.enabled = false;
    this.lastDir = null;
    this.filteredGamma = 0;
    this.filteredBeta = 0;
    this.alpha = 0.3; // low-pass filter factor
  }

  async init() {
    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        const permission = await DeviceOrientationEvent.requestPermission();
        if (permission !== 'granted') return false;
      } catch { return false; }
    }

    if (!window.DeviceOrientationEvent) return false;

    window.addEventListener('deviceorientation', (e) => this.onOrientation(e));
    this.enabled = true;
    return true;
  }

  onOrientation(e) {
    if (e.gamma === null || e.beta === null) return;

    // Low-pass filter
    this.filteredGamma = this.filteredGamma * (1 - this.alpha) + e.gamma * this.alpha;
    this.filteredBeta  = this.filteredBeta  * (1 - this.alpha) + e.beta  * this.alpha;

    const gamma = this.filteredGamma; // left-right tilt
    const beta  = this.filteredBeta;  // forward-back tilt

    let dir = null;
    // Use the stronger axis
    if (Math.abs(gamma) > Math.abs(beta)) {
      if (gamma < -30) dir = DIR.LEFT;
      else if (gamma > 30) dir = DIR.RIGHT;
    } else {
      if (beta < -20) dir = DIR.UP;
      else if (beta > 20) dir = DIR.DOWN;
    }

    if (dir && dir !== this.lastDir) {
      this.lastDir = dir;
      state = changeDirection(state, dir);
    }
  }
}
```

**Thresholds** (tunable via config):
- LEFT/RIGHT: `|gamma| > 30°`
- UP/DOWN: `|beta| > 20°`
- Dead zone: thresholds prevent direction switching on small movements

### 3. On-Screen Touch Buttons (Z and X)

**File:** `public/gameboy.html` (HTML + CSS + JavaScript)

HTML overlay buttons, positioned below the canvas:

```html
<div class="touch-controls" id="touchControls" style="display:none">
  <button class="touch-btn btn-z" data-action="fire">⚔️ Z</button>
  <button class="touch-btn btn-x" data-action="interact">🤝 X</button>
</div>
```

CSS:
```css
.touch-controls {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-top: 12px;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}
.touch-btn {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px solid #8bac0f;
  background: rgba(26, 26, 46, 0.9);
  color: #e94560;
  font-size: 14px;
  font-family: monospace;
  touch-action: none;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.touch-btn:active {
  background: #e94560;
  color: #1a1a2e;
}
```

JavaScript event handlers:
```js
document.querySelectorAll('.touch-btn').forEach(btn => {
  const action = btn.dataset.action;
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (!state || state.gameState !== 'playing') return;
    if (action === 'fire') state = fire(state);
    else if (action === 'interact') state = interact(state);
    updateHUD();
  });
});
```

### 4. Touch Swipe Fallback (When Gyroscope Unavailable)

```js
let touchStartX = 0, touchStartY = 0;

canvas.addEventListener('touchstart', (e) => {
  if (touchOnButton) return; // ignore if touch target is a button
  const touch = e.touches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (touchStartX === 0) return;
  const touch = e.changedTouches[0];
  const dx = touch.clientX - touchStartX;
  const dy = touch.clientY - touchStartY;
  const minSwipe = 30;

  if (Math.abs(dx) > Math.abs(dy)) {
    if (dx > minSwipe) state = changeDirection(state, DIR.RIGHT);
    else if (dx < -minSwipe) state = changeDirection(state, DIR.LEFT);
  } else {
    if (dy > minSwipe) state = changeDirection(state, DIR.DOWN);
    else if (dy < -minSwipe) state = changeDirection(state, DIR.UP);
  }
  touchStartX = 0;
  touchStartY = 0;
});
```

### 5. Mobile Class Toggle

The `body` element gets a `.mobile` class when:
- Touch support detected at load time, OR
- User manually clicks a "Mobile Controls" toggle button

```js
const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
if (isMobile) {
  document.body.classList.add('mobile');
  document.getElementById('touchControls').style.display = 'flex';
}
```

---

## Data Flow

### Input → Action Mapping

| Input Source | Trigger | Action | Function Called |
|---|---|---|---|
| Gyroscope | `deviceorientation` with gamma/beta above threshold | Direction change | `changeDirection(state, dir)` |
| Touch button Z | `touchstart` on `.btn-z` | Fire projectile | `fire(state)` |
| Touch button X | `touchstart` on `.btn-x` | Interact | `interact(state)` |
| Touch swipe | `touchstart` → `touchend` on canvas | Direction change | `changeDirection(state, dir)` |
| Keyboard ↓ | `keydown` ArrowUp/ArrowDown/ArrowLeft/ArrowRight | Direction change | `changeDirection(state, dir)` |
| Keyboard Z | `keydown` KeyZ | Fire projectile | `fire(state)` |
| Keyboard X | `keydown` KeyX | Interact | `interact(state)` |
| Keyboard Enter | `keydown` Enter | Start game | `start()` |
| Keyboard Shift | `keydown` ShiftLeft/ShiftRight | Pause | state toggle |
| Keyboard Space | `keydown` Space | Restart | `init()` |

### State Changes

- All input handling is in `gameboy.html` — the game engine receives the same function calls regardless of input source
- No new state fields needed in the existing game state
- `.mobile` class toggling is purely cosmetic (CSS)
- Gyroscope controller is an independent class; it doesn't modify game state directly

---

## Test Plan

### Unit Tests (`tests/mobile-support.test.js`)

1. **Gyroscope filtering:** Test low-pass filter with mock deviceorientation events
2. **Input priority:** When both keyboard and touch fire in same tick, last-write-wins
3. **Button action dispatch:** Verify touch button maps to correct `fire()` / `interact()`
4. **Mobile detection:** `'ontouchstart' in window` and `navigator.maxTouchPoints` checks

### Integration / Manual Tests

1. **Open on phone:** Game scales to fit screen, buttons visible
2. **Tilt left/right:** Snake turns accordingly
3. **Tap Z:** Snake fires
4. **Tap X:** Snake interacts with gacha
5. **Swipe on canvas:** Direction changes (when gyroscope disabled)
6. **Desktop keyboard:** Unchanged behavior
7. **Gyroscope permission denied:** Graceful fallback to swipe
8. **Landscape vs portrait:** Both orientations work

---

## Acceptance Criteria

- [ ] AC1: Game opens on phone and scales to fit the viewport
- [ ] AC2: Gyroscope tilt controls snake direction (LEFT/RIGHT/UP/DOWN)
- [ ] AC3: On-screen Z button fires projectile
- [ ] AC4: On-screen X button triggers interact
- [ ] AC5: Touch swipe on canvas changes direction (fallback mode)
- [ ] AC6: Desktop keyboard controls remain fully functional and unchanged
- [ ] AC7: Gyroscope handles permission request on iOS gracefully
- [ ] AC8: Gyroscope has low-pass filter to reduce jitter
- [ ] AC9: Touch controls support both `touchstart` and `touchend`
- [ ] AC10: Existing tests still pass

---

## Implementation Order

1. Add responsive CSS to `gameboy.html`
2. Add mobile detection and `.mobile` class toggling
3. Add touch Z/X button HTML + CSS + JS
4. Add gyroscope controller class with low-pass filter
5. Add touch swipe fallback
6. Add mobile controls toggle button
7. Run existing tests — they must still pass
8. Manual test on real phone
