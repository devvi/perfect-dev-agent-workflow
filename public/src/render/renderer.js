// FILE: public/src/render/renderer.js
// Main render dispatch

import { CANVAS_SIZE, PALETTE, CELL_SIZE } from '../engine/constants.js';
import { renderRoom } from './room.js';
import { renderMinimap } from './minimap.js';
import { renderHUD } from './hud.js';
import { renderOverlay } from './overlays.js';

/**
 * Master render function - draws everything
 */
export function render(ctx, state) {
  const { world } = state;
  if (!world) return;

  // Clear
  ctx.fillStyle = PALETTE.BG;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Render current room (with screen shake)
  ctx.save();
  if (state.screenShake && state.screenShake.intensity > 0.3) {
    const { intensity } = state.screenShake;
    ctx.translate(
      (Math.random() - 0.5) * 2 * intensity,
      (Math.random() - 0.5) * 2 * intensity
    );
  }
  renderRoom(ctx, state, world);
  ctx.restore();

  // Render HUD
  renderHUD(ctx, state);

  // Render minimap
  renderMinimap(ctx, state, world);

  // Render overlays
  renderOverlay(ctx, state);

  // Scanlines (screen-wide effect)
  renderScanlines(ctx);
}

/**
 * Scanline effect
 */
export function renderScanlines(ctx) {
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < CANVAS_SIZE; y += 3) {
    ctx.fillRect(0, y, CANVAS_SIZE, 1);
  }
}
