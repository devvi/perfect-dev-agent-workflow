// FILE: public/src/render/minimap.js
// Minimap + fog of war rendering

import { MAP_COLS, MAP_ROWS, PALETTE, ROOM_TYPE, MINIMAP_SIZE } from '../engine/constants.js';
import { getRoomAt } from '../engine/world.js';

const ROOM_PX = Math.floor(MINIMAP_SIZE / MAP_COLS);

/**
 * Render the minimap (bottom-right corner)
 */
export function renderMinimap(ctx, state, world) {
  const offsetX = 400 - MINIMAP_SIZE - 8;
  const offsetY = 400 - MINIMAP_SIZE - 8;

  // Background
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(offsetX - 2, offsetY - 2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4);
  ctx.strokeStyle = '#306230';
  ctx.lineWidth = 1;
  ctx.strokeRect(offsetX - 2, offsetY - 2, MINIMAP_SIZE + 4, MINIMAP_SIZE + 4);

  // Draw rooms
  for (let ry = 0; ry < world.rows; ry++) {
    for (let rx = 0; rx < world.cols; rx++) {
      const room = world.rooms[ry][rx];
      const px = offsetX + rx * ROOM_PX;
      const py = offsetY + ry * ROOM_PX;

      if (!room.explored) {
        // Fog of war
        ctx.fillStyle = PALETTE.FOG;
        ctx.fillRect(px, py, ROOM_PX, ROOM_PX);
      } else {
        // Room color based on type
        let color = PALETTE.MINIMAP_EXPLORED;
        if (room.type === ROOM_TYPE.GOAL) color = PALETTE.GOLD;
        else if (room.type === ROOM_TYPE.SAVE) color = PALETTE.SAVE_POINT;
        else if (room.type === ROOM_TYPE.GACHA) color = PALETTE.GOLD;
        else if (room.type === ROOM_TYPE.KEY_SHRINE) color = '#aaccff';

        ctx.fillStyle = color;
        ctx.fillRect(px, py, ROOM_PX, ROOM_PX);

        // Draw door indicators
        ctx.fillStyle = '#8bac0f';
        for (const dir of ['up', 'down', 'left', 'right']) {
          if (room.doors[dir]) {
            const doorW = 2;
            const doorH = 2;
            let dx = px, dy = py;
            if (dir === 'up') { dx = px + ROOM_PX / 2 - doorW / 2; dy = py - 1; }
            else if (dir === 'down') { dx = px + ROOM_PX / 2 - doorW / 2; dy = py + ROOM_PX - 1; }
            else if (dir === 'left') { dx = px - 1; dy = py + ROOM_PX / 2 - doorH / 2; }
            else if (dir === 'right') { dx = px + ROOM_PX - 1; dy = py + ROOM_PX / 2 - doorH / 2; }

            // Check if locked
            if (room.doors[dir] && room.doors[dir].locked) {
              ctx.fillStyle = PALETTE.LOCKED;
            }

            ctx.fillRect(dx, dy, doorW, doorH);
          }
        }

        // Draw locked indicators
        for (const dir of ['up', 'down', 'left', 'right']) {
          if (room.doors[dir] && room.doors[dir].locked) {
            ctx.fillStyle = '#ff4444';
            const lx = px + ROOM_PX / 2 - 1;
            const ly = py + ROOM_PX / 2 - 1;
            ctx.fillRect(lx, ly, 2, 2);
          }
        }

        // Size gate indicator
        if (room.sizeGate) {
          ctx.fillStyle = '#ff8844';
          const sx = px + ROOM_PX / 2 - 1;
          const sy = py + ROOM_PX / 2 - 1;
          ctx.fillRect(sx, sy, 2, 2);
        }
      }

      // Grid lines
      ctx.strokeStyle = 'rgba(48, 98, 48, 0.3)';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(px, py, ROOM_PX, ROOM_PX);
    }
  }

  // Player position indicator
  const playerRoom = state.currentRoom;
  const ppX = offsetX + playerRoom.x * ROOM_PX + ROOM_PX / 2;
  const ppY = offsetY + playerRoom.y * ROOM_PX + ROOM_PX / 2;

  ctx.fillStyle = PALETTE.MINIMAP_CURRENT;
  ctx.beginPath();
  ctx.arc(ppX, ppY, 3, 0, Math.PI * 2);
  ctx.fill();

  // Blink effect
  ctx.fillStyle = 'rgba(0, 255, 136, 0.3)';
  ctx.beginPath();
  ctx.arc(ppX, ppY, 5, 0, Math.PI * 2);
  ctx.fill();

  // Label
  ctx.fillStyle = '#8bac0f';
  ctx.font = '6px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('MAP', offsetX, offsetY - 4);
}
