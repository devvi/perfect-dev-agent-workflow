// FILE: public/src/render/hud.js
// HUD rendering (score, length, items, keys)

import { PALETTE, CANVAS_SIZE } from '../engine/constants.js';
import { powerUpTypeName } from '../engine/items.js';

/**
 * Render the HUD overlay (top bar + item slots)
 */
export function renderHUD(ctx, state) {
  const hudY = 0;
  const hudH = 24;

  // Semi-transparent background
  ctx.fillStyle = 'rgba(26, 26, 46, 0.8)';
  ctx.fillRect(0, hudY, CANVAS_SIZE, hudH);

  // Score
  ctx.fillStyle = PALETTE.HUD_TEXT;
  ctx.font = '11px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('SCORE: ' + state.score, 8, 16);

  // Length
  ctx.textAlign = 'center';
  ctx.fillText('LEN: ' + state.snake.length, CANVAS_SIZE / 2, 16);

  // Keys
  ctx.textAlign = 'right';
  const keyCount = state.keysFound.size;
  ctx.fillText('KEYS: ' + keyCount, CANVAS_SIZE - 8, 16);

  // Room info
  ctx.fillStyle = '#8bac0f';
  ctx.font = '9px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('R: ' + state.currentRoom.x + ',' + state.currentRoom.y, 8, 36);

  // Rooms explored
  ctx.textAlign = 'right';
  ctx.fillText('EXP: ' + state.roomsExplored + '/' + (state.world.cols * state.world.rows), CANVAS_SIZE - 8, 36);

  // Active items (power-ups)
  const items = state.inventory.items;
  if (items.length > 0) {
    ctx.fillStyle = PALETTE.GOLD;
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('ITEMS:', CANVAS_SIZE / 2, 50);

    for (let i = 0; i < Math.min(items.length, 4); i++) {
      const item = items[i];
      const ix = CANVAS_SIZE / 2 - 80 + i * 45;
      ctx.fillStyle = '#f0c040';
      ctx.fillText(powerUpTypeName(item.type).substring(0, 6), ix, 60);
    }
  }

  // Gacha message (temporary)
  if (state.gachaMessage) {
    ctx.fillStyle = PALETTE.GOLD;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(state.gachaMessage, CANVAS_SIZE / 2, 380);
  }

  // Controls hint
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.font = '7px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('Z=Fire  X=Use  Arrows=Move', CANVAS_SIZE - 4, CANVAS_SIZE - 6);
}
