# Task Summary: Pixel Snake Game (#1)

> Source: `docs/PRD/1-pixel-snake-game.md`

## Overview

Build a simple, browser-playable pixel-art Snake game using Vanilla JS + Canvas API.

## Stage Outputs

| Stage | Output | Format |
|-------|--------|--------|
| Research (✅ this) | `docs/PRD/1-pixel-snake-game.md` | PRD document |
| Plan | `docs/DESIGN/1-pixel-snake-game.md` | Design doc + test cases |
| Implement | `src/snake-game/index.html` | Single-file game (or minimal multi-file) |

## Key Decisions

- **Approach:** Vanilla JS + Canvas (Approach A)
- **Grid:** 20×20, 16px per cell, scaled to 320×320 CSS pixels
- **Speed:** 200ms/tick, increase every 5 food eaten
- **File structure:** Single `index.html` (or `public/index.html`) — inline HTML/CSS/JS
- **No build tools:** Pure frontend, zero dependencies

## Acceptance Checklist

- [ ] Browser opens → game renders with snake + food
- [ ] Arrow keys control direction
- [ ] Eating food → score +10, snake grows
- [ ] Wall collision → game over with score overlay
- [ ] Self-collision → game over with score overlay
- [ ] Restart button works
- [ ] Food never spawns on snake body
- [ ] 180° reversal inputs are ignored
- [ ] Vercel deploy serves the game correctly

## Edge Cases to Test

1. Wall collision — head goes out of bounds
2. Self-collision — head hits own tail
3. Food spawn on occupied cell — re-roll until empty
4. Rapid key presses — input buffered, no reverse
5. Victory state — snake fills entire grid
6. Tab switch / inactivity — no burst movement on return
