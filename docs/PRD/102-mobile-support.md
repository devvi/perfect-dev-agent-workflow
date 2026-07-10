# Research: 游戏支持手机游玩 (Game Supports Mobile Play)

> Parent Issue: #102
> Agent: Hermes Agent
> Date: 2026-07-10

---

## 1. Problem Definition

### Current Behavior
The Metroidvania Snake game is a desktop-only experience. All controls are keyboard-based:
- **Arrow keys** (↑↓←→) for snake movement
- **Z key** for fire/attack
- **X key** for interact (gacha machine, save point)
- **Enter** to start game
- **Shift** to pause
- **Space** to restart
- **S** to load save

The canvas is fixed at 400×400 pixels. The page uses `meta viewport` for scaling but provides no touch or mobile-specific input handling. On a phone, the game renders tiny and unplayable with zero touch/gyroscope support.

### Expected Behavior
1. **Phone can open the game** — responsive layout that fits mobile screens
2. **Phone can play the game** — full control via touch and gyroscope:
   - Gyroscope tilt controls for snake direction (UP/DOWN/LEFT/RIGHT)
   - On-screen touch buttons for Z (fire/attack) and X (interact)
   - Touch-friendly responsive canvas sizing

### User Scenarios
- **Scenario A:** User opens the game URL on their smartphone → sees the game properly sized for their screen
- **Scenario B:** User tilts their phone → snake direction changes correspondingly (gyroscope input)
- **Scenario C:** User taps on-screen Z button → snake fires a projectile
- **Scenario D:** User taps on-screen X button → snake interacts with gacha/save point
- **Frequency:** Every mobile user (new audience segment)

---

## 2. Design Intent (Feature)

### Why Does Current Behavior Exist?
The game was originally built as a desktop-only GameBoy-inspired experience. The input handling in `public/gameboy.html` exclusively uses `document.addEventListener('keydown', ...)` with keyboard-specific event codes. No mobile input abstractions were added because mobile was not in scope.

### Why Change Now?
Mobile gaming represents a significant user base. Adding mobile support with gyroscope controls and touch buttons makes the game accessible on phones without changing the desktop experience. The game's simple control scheme (4 directions + 2 action buttons) is a perfect fit for gyroscope + touch input.

### Previous Constraints
- Must NOT break existing desktop keyboard controls
- Must NOT change game engine logic (core.js, constants.js, etc.)
- Must NOT require new dependencies or build steps
- Gyroscope must use the DeviceOrientation API (no external libraries)
- Touch buttons must be rendered as HTML/CSS overlays (not on canvas, for accessibility)
- Canvas must remain the primary rendering surface

---

## 3. Impact Analysis

### Directly Affected Modules

| File | Module | Nature of Change |
|------|--------|------------------|
| `public/gameboy.html` | Main HTML + game loop | Add responsive CSS, touch button overlays, gyroscope listener, mobile input mapper |
| `public/src/engine/constants.js` | Constants | No direct changes needed |

### Indirectly Affected Modules

| File | Module | Why Affected |
|------|--------|--------------|
| `public/src/engine/core.js` | Game logic | No changes — input mapping is done in gameboy.html before calling exported functions |
| `index.html` | Redirect page | May need minor viewport tweaks |

### Data Flow Impact

```
Before: KeyboardEvent → keydown handler → core.changeDirection/fire/interact
After:  KeyboardEvent     ─┬→ keydown handler ─┬→ core.changeDirection/fire/interact
        TouchEvent        ─┤                   │
        DeviceOrientation  ─┘                   │
        (Gyroscope)                             │
            ↓                                   ↓
        MobileInputMapper                 Same game logic (no changes)
        (normalizes to UP/DOWN/LEFT/RIGHT, Z, X)
```

### Documents to Update
- [x] `docs/PRD/102-mobile-support.md` (this file)
- [ ] `docs/DESIGN/102-mobile-support.md` (design doc in plan phase)
- [ ] `README.md` (add mobile support info)

---

## 4. Solution Comparison

### Approach A: CSS Resize + Touch Button Overlays + Gyroscope (Recommended)

**Description:**
- **Responsive canvas:** Use CSS to scale the 400×400 canvas proportionally to fit viewport width/height using `max-width: 100vw; max-height: 100dvh; object-fit: contain`
- **Touch Z/X buttons:** Add two `<button>` elements overlaid below/beside the canvas with touch event listeners mapped to `fire()` and `interact()`
- **Gyroscope control:** Use `DeviceOrientationEvent` to detect phone tilt: gamma (left-right tilt) → LEFT/RIGHT direction; beta (forward-back tilt) → UP/DOWN direction
- **Swipe/gesture:** Add touch-swipe support for direction as fallback when gyroscope is unavailable
- **Add a "mobile controls" toggle** so users can switch between gyroscope, swipe, and on-screen D-pad modes

**Pros:**
- Zero changes to game engine code
- Gyroscope provides intuitive tilt-to-steer gameplay
- Touch buttons feel native on mobile
- Desktop keyboard controls remain untouched
- Canvas stays at native resolution (just CSS-scaled)
- No new npm dependencies

**Cons:**
- DeviceOrientation API requires user permission on iOS 13+ (`DeviceOrientationEvent.requestPermission()`)
- Gyroscope can be jittery on low-end devices
- Some devices lack gyroscope (tablets in landscape, etc.)
- Need fallback for gyroscope-unavailable devices

**Risk:** Low — all browser APIs are well-documented and widely supported
**Effort:** Medium (~2-3 hours)

### Approach B: Full Virtual D-Pad + Touch Buttons (No Gyroscope)

**Description:**
- Add an on-screen D-pad (4 directional buttons) and Z/X action buttons
- All input via touch events, no gyroscope involvement
- Responsive canvas via CSS scaling

**Pros:**
- Works on ALL devices (no hardware dependency)
- Predictable controls
- Simpler implementation

**Cons:**
- Less immersive than gyroscope
- D-pad takes up significant screen real estate
- Slower control response compared to tilt

**Risk:** Low
**Effort:** Medium (~2 hours)

### Approach C: Gyroscope-Only (No Touch Buttons)

**Description:**
- Pure gyroscope steering; keyboard still works on desktop
- No virtual buttons — Z and X mapped to tap gestures (tap = Z, double-tap = X or long press)
- No CSS scaling changes

**Pros:**
- Minimal code changes
- Cleanest mobile UI

**Cons:**
- No obvious way to distinguish Z vs X without UI feedback
- Tap detection conflicts with gyroscope direction changes
- Poor UX — users expect visible buttons
- Not accessible

**Risk:** Medium — poor UX outweighs simplicity
**Effort:** Small (~1 hour)

### Recommendation
→ **Approach A** because:
1. Gyroscope steering is intuitive and fun for a snake game
2. On-screen Z/X buttons provide clear, reliable action controls
3. Touch swipe fallback covers devices without gyroscope
4. CSS-only responsive scaling is zero-cost and zero-risk
5. Game engine remains completely untouched

---

## 5. Boundary Conditions & Acceptance Criteria

### Normal Path

| # | Scenario | Steps | Expected |
|---|----------|-------|----------|
| 1 | Phone opens game | Navigate to URL on smartphone | Game canvas scales to fit screen; touch buttons visible; no horizontal overflow |
| 2 | Gyroscope steer | Tilt phone left | Snake turns LEFT |
| 3 | Gyroscope steer | Tilt phone right | Snake turns RIGHT |
| 4 | Gyroscope steer | Tilt phone forward (top away) | Snake moves DOWN |
| 5 | Gyroscope steer | Tilt phone backward (top toward) | Snake moves UP |
| 6 | Touch Z button | Tap Z overlay | Snake fires projectile (same as keyboard Z) |
| 7 | Touch X button | Tap X overlay | Snake interacts (same as keyboard X) |
| 8 | Desktop still works | Press arrow keys | Controls work exactly as before |
| 9 | Mixed input | Use keyboard and touch simultaneously | Last input wins (no conflicts) |

### Edge Cases

| # | Edge Case | Expected Behavior |
|---|-----------|-------------------|
| 1 | No gyroscope (desktop, tablet) | Falls back to swipe or disable gyroscope; keyboard still works |
| 2 | Gyroscope permission denied on iOS | DeviceOrientationEvent not available; fallback to swipe |
| 3 | Phone in landscape vs portrait | Both orientations supported; layout adjusts |
| 4 | Very small screen (<320px width) | Canvas and buttons still usable; minimum scale ensures playability |
| 5 | Browser doesn't support DeviceOrientation | `window.DeviceOrientationEvent` undefined → skip gyroscope init |
| 6 | Touch and keyboard pressed simultaneously | Last input wins — no crash or weird state |

### Failure Paths

| # | Failure | Handling |
|---|---------|----------|
| 1 | Gyroscope data is noisy/jittery | Apply low-pass filter (exponential moving average) to smooth tilt values |
| 2 | On-screen button tap also triggers scroll | Use `e.preventDefault()` and `touch-action: none` |
| 3 | Canvas 400×400 is too small on high-DPI | CSS scales up; canvas internal resolution unchanged (no blur since pixel-art) |

> These directly become test case skeletons in Plan phase.

---

## 6. Dependencies & Blockers

### Depends On

| Dependency | Status | Risk |
|------------|--------|------|
| `public/gameboy.html` | Stable | Low — main HTML file |
| `public/src/engine/core.js` | Stable | None — no changes needed |
| `DeviceOrientation API` | Browser API | Low — well-supported; permission needed on iOS |

### Blocks

| Future Work | Priority |
|-------------|----------|
| Add mobile-specific HUD | Future |
| Add mobile audio feedback for touch | Future |
| Touch swipe on canvas for direction | Low (already in this plan) |

### Preparation Needed
- [ ] Test DeviceOrientation API on real iOS device (permission flow)
- [ ] Test canvas scaling on various Android/iOS screen sizes
- [ ] Verify mobile browser support for DeviceOrientationEvent

---

## 7. Spike / Experiment (Optional — depth/deep only)

### Question to Answer
How reliably does the DeviceOrientation API work for tilt-based direction control?

### Method
Quick prototype in browser DevTools console:
```js
if (window.DeviceOrientationEvent) {
  window.addEventListener('deviceorientation', (e) => {
    console.log('gamma:', e.gamma, 'beta:', e.beta);
  });
}
```

### Expected Result
- gamma (左右倾斜): -180 to 180, with ~0 at flat. Tilt left = negative, right = positive.
- beta (前后倾斜): -180 to 180, with ~0 at flat. Tilt forward (top away) = positive, backward = negative.

### Thresholds for Direction
```
gamma < -30  → DIR.LEFT
gamma > 30   → DIR.RIGHT
beta < -20   → DIR.UP (tilt top toward you)
beta > 20    → DIR.DOWN (tilt top away)
```
(Thresholds may need adjustment based on real device testing.)

### Impact on Approach
If gyroscope is too jittery on most devices, the recommended approach shifts to Approach B (D-pad only). Threshold tuning and filtering should resolve this.
