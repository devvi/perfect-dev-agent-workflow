// FILE: public/src/render/room.js
// Room rendering (tiles, entities)

import {
  ROOM_SIZE, CELL_SIZE, CELL, ROOM_TYPE, PALETTE,
} from '../engine/constants.js';
import { getRoomAt, worldToRoomCoords } from '../engine/world.js';

/**
 * Render the current room (tiles, entities, snake, projectiles)
 */
export function renderRoom(ctx, state, world) {
  const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
  if (!room) return;

  // Draw tiles
  for (let cy = 0; cy < ROOM_SIZE; cy++) {
    for (let cx = 0; cx < ROOM_SIZE; cx++) {
      const cell = room.tiles[cy][cx];
      const px = cx * CELL_SIZE;
      const py = cy * CELL_SIZE;

      switch (cell) {
        case CELL.FLOOR:
        case CELL.DOOR:
          // Checkerboard pattern for floor
          if ((cx + cy) % 2 === 0) {
            ctx.fillStyle = '#8bac0f';
            ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          }
          break;

        case CELL.WALL:
          ctx.fillStyle = PALETTE.DARK_GREEN;
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          break;

        case CELL.STONE_WALL:
          ctx.fillStyle = '#1a3a1a';
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          break;

        case CELL.CRACKED_WALL:
          ctx.fillStyle = PALETTE.DARK_GREEN;
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          // Draw crack lines
          ctx.strokeStyle = PALETTE.CRACK;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 5);
          ctx.lineTo(px + 10, py + 12);
          ctx.lineTo(px + 16, py + 8);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(px + 5, py + 16);
          ctx.lineTo(px + 8, py + 10);
          ctx.stroke();
          break;

        case CELL.DEATH_WALL:
          // Red/lava glow
          ctx.fillStyle = '#cc3300';
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          // Inner highlight
          ctx.fillStyle = '#ff6633';
          ctx.beginPath();
          ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 6, 0, Math.PI * 2);
          ctx.fill();
          // Spiky edges
          ctx.strokeStyle = '#ff4400';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(px + 2, py + 18);
          ctx.lineTo(px + 6, py + 12);
          ctx.lineTo(px + 10, py + 18);
          ctx.lineTo(px + 14, py + 12);
          ctx.lineTo(px + 18, py + 18);
          ctx.stroke();
          break;

        case CELL.SPIKE:
          // Dark base with red triangles
          ctx.fillStyle = '#555';
          ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE);
          ctx.fillStyle = '#aa3333';
          for (let s = 0; s < 3; s++) {
            const spx = px + 2 + s * 6;
            ctx.beginPath();
            ctx.moveTo(spx, py + CELL_SIZE - 2);
            ctx.lineTo(spx + 3, py + 2);
            ctx.lineTo(spx + 6, py + CELL_SIZE - 2);
            ctx.fill();
          }
          break;
      }
    }
  }

  // Draw door indicators (arrows)
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir]) {
      drawDoorIndicator(ctx, room, dir);
    }
  }

  // Draw room type special markers
  drawRoomMarkers(ctx, room);

  // Draw food
  for (const food of room.entities.food) {
    const { cx, cy } = worldToRoomCoords(food.x, food.y);
    const px = cx * CELL_SIZE;
    const py = cy * CELL_SIZE;
    ctx.fillStyle = PALETTE.FOOD;
    ctx.beginPath();
    ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  // Draw enemies
  for (const enemy of room.entities.enemies) {
    drawEnemy(ctx, enemy, world);
  }

  // Draw snake
  drawSnake(ctx, state);

  // Draw projectiles
  for (const proj of state.projectiles) {
    const { cx, cy } = worldToRoomCoords(proj.x, proj.y);
    const roomOfProj = worldToRoomCoords(proj.x, proj.y);
    if (roomOfProj.rx === state.currentRoom.x && roomOfProj.ry === state.currentRoom.y) {
      const px = cx * CELL_SIZE;
      const py = cy * CELL_SIZE;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(px + CELL_SIZE / 2, py + CELL_SIZE / 2, 3, 0, Math.PI * 2);
      ctx.fill();
      // Trail
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.beginPath();
      ctx.arc(px + CELL_SIZE / 2 - proj.dir.x * 6, py + CELL_SIZE / 2 - proj.dir.y * 6, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Draw save point marker
  if (room.savePoint) {
    const spx = room.savePoint.x * CELL_SIZE;
    const spy = room.savePoint.y * CELL_SIZE;
    ctx.fillStyle = PALETTE.SAVE_POINT;
    ctx.fillRect(spx + 2, spy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    ctx.fillStyle = '#ffffff';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💾', spx + CELL_SIZE / 2, spy + CELL_SIZE / 2 + 3);
  }

  // Draw gacha machine
  if (room.gachaMachine) {
    const gx = room.gachaMachine.x * CELL_SIZE;
    const gy = room.gachaMachine.y * CELL_SIZE;
    ctx.fillStyle = PALETTE.GOLD;
    ctx.fillRect(gx + 1, gy + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    ctx.fillStyle = PALETTE.BLACK;
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('🎰', gx + CELL_SIZE / 2, gy + CELL_SIZE / 2 + 4);
  }

  // Size gate indicators
  if (room.sizeGate) {
    const gateDir = room.sizeGate.doorDir;
    const doorPos = getDoorPosition(gateDir);
    if (doorPos) {
      ctx.fillStyle = 'rgba(170, 50, 50, 0.5)';
      ctx.fillRect(doorPos.x, doorPos.y, CELL_SIZE * 3, CELL_SIZE);
      ctx.fillStyle = '#ffffff';
      ctx.font = '8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('LEN ' + room.sizeGate.requiredLength + '+', doorPos.x + CELL_SIZE * 1.5, doorPos.y + 12);
    }
  }

  // Locked door indicator
  for (const dir of ['up', 'down', 'left', 'right']) {
    if (room.doors[dir] && room.doors[dir].locked) {
      ctx.fillStyle = 'rgba(200, 50, 50, 0.4)';
      const doorPos = getDoorPosition(dir);
      if (doorPos) {
        ctx.fillRect(doorPos.x, doorPos.y, CELL_SIZE * 3, CELL_SIZE);
        ctx.fillStyle = '#ff0000';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('🔒', doorPos.x + CELL_SIZE * 1.5, doorPos.y + 14);
      }
    }
  }
}

/**
 * Draw snake
 */
function drawSnake(ctx, state) {
  // Flash effect when stuck (Issue #46)
  const isStuck = state.stuckCounter > 0;
  if (isStuck) {
    ctx.globalAlpha = (state.stuckCounter % 2 === 0) ? 0.4 : 1.0;
  }

  for (let i = state.snake.length - 1; i >= 0; i--) {
    const seg = state.snake[i];
    const { cx, cy } = worldToRoomCoords(seg.x, seg.y);
    // Only draw if in current room
    const { rx, ry } = worldToRoomCoords(seg.x, seg.y);
    if (rx !== state.currentRoom.x || ry !== state.currentRoom.y) continue;

    const px = cx * CELL_SIZE;
    const py = cy * CELL_SIZE;

    if (i === 0) {
      ctx.fillStyle = isStuck ? '#ff4444' : PALETTE.SNAKE_HEAD;
      ctx.fillRect(px + 1, py + 1, CELL_SIZE - 2, CELL_SIZE - 2);
      // Eyes
      ctx.fillStyle = '#ffffff';
      const eyeSize = 3;
      if (state.direction.y === -1) { // up
        ctx.fillRect(px + 5, py + 4, eyeSize, eyeSize);
        ctx.fillRect(px + 12, py + 4, eyeSize, eyeSize);
      } else if (state.direction.y === 1) { // down
        ctx.fillRect(px + 5, py + 13, eyeSize, eyeSize);
        ctx.fillRect(px + 12, py + 13, eyeSize, eyeSize);
      } else if (state.direction.x === -1) { // left
        ctx.fillRect(px + 4, py + 5, eyeSize, eyeSize);
        ctx.fillRect(px + 4, py + 12, eyeSize, eyeSize);
      } else { // right
        ctx.fillRect(px + 13, py + 5, eyeSize, eyeSize);
        ctx.fillRect(px + 13, py + 12, eyeSize, eyeSize);
      }
    } else {
      ctx.fillStyle = PALETTE.SNAKE_BODY;
      ctx.fillRect(px + 2, py + 2, CELL_SIZE - 4, CELL_SIZE - 4);
    }
  }
  if (isStuck) ctx.globalAlpha = 1.0;
}

/**
 * Draw an enemy
 */
function drawEnemy(ctx, enemy, world) {
  const { cx, cy } = worldToRoomCoords(enemy.x, enemy.y);
  const px = cx * CELL_SIZE;
  const py = cy * CELL_SIZE;

  // Draw body segments
  for (let i = enemy.segments.length - 1; i >= 0; i--) {
    const seg = enemy.segments[i];
    const { cx: scx, cy: scy } = worldToRoomCoords(seg.x, seg.y);
    const spx = scx * CELL_SIZE;
    const spy = scy * CELL_SIZE;

    if (i === 0) {
      ctx.fillStyle = PALETTE.ENEMY_HEAD;
    } else {
      ctx.fillStyle = PALETTE.ENEMY;
    }
    ctx.fillRect(spx + 2, spy + 2, CELL_SIZE - 4, CELL_SIZE - 4);
  }

  // Draw HP indicator
  ctx.fillStyle = '#ffffff';
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('❤' + enemy.hp, px + CELL_SIZE / 2, py - 2);
}

/**
 * Draw door indicator (directional hint)
 */
function drawDoorIndicator(ctx, room, dir) {
  const mid = Math.floor(ROOM_SIZE / 2);
  let px, py;

  switch (dir) {
    case 'up':
      px = (mid - 1) * CELL_SIZE;
      py = 0;
      ctx.fillStyle = 'rgba(48, 98, 48, 0.6)';
      ctx.fillRect(px, py, CELL_SIZE * 3, CELL_SIZE);
      // Arrow
      ctx.fillStyle = '#8bac0f';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▲', px + CELL_SIZE * 1.5, py + 14);
      break;
    case 'down':
      px = (mid - 1) * CELL_SIZE;
      py = (ROOM_SIZE - 1) * CELL_SIZE;
      ctx.fillStyle = 'rgba(48, 98, 48, 0.6)';
      ctx.fillRect(px, py, CELL_SIZE * 3, CELL_SIZE);
      ctx.fillStyle = '#8bac0f';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('▼', px + CELL_SIZE * 1.5, py + 16);
      break;
    case 'left':
      px = 0;
      py = (mid - 1) * CELL_SIZE;
      ctx.fillStyle = 'rgba(48, 98, 48, 0.6)';
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE * 3);
      ctx.fillStyle = '#8bac0f';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◄', px + 10, py + CELL_SIZE * 1.5 + 4);
      break;
    case 'right':
      px = (ROOM_SIZE - 1) * CELL_SIZE;
      py = (mid - 1) * CELL_SIZE;
      ctx.fillStyle = 'rgba(48, 98, 48, 0.6)';
      ctx.fillRect(px, py, CELL_SIZE, CELL_SIZE * 3);
      ctx.fillStyle = '#8bac0f';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('►', px + 10, py + CELL_SIZE * 1.5 + 4);
      break;
  }
}

/**
 * Draw room type markers
 */
function drawRoomMarkers(ctx, room) {
  const mid = Math.floor(ROOM_SIZE / 2);
  const px = mid * CELL_SIZE;
  const py = mid * CELL_SIZE;

  if (room.type === ROOM_TYPE.GOAL) {
    ctx.fillStyle = 'rgba(240, 192, 64, 0.3)';
    ctx.fillRect(0, 0, ROOM_SIZE * CELL_SIZE, ROOM_SIZE * CELL_SIZE);
    ctx.fillStyle = PALETTE.GOLD;
    ctx.font = '16px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('★ GOAL', px, py + 6);
  }

  if (room.type === ROOM_TYPE.START) {
    ctx.fillStyle = 'rgba(50, 150, 50, 0.1)';
    ctx.fillRect(0, 0, ROOM_SIZE * CELL_SIZE, ROOM_SIZE * CELL_SIZE);
  }

  if (room.type === ROOM_TYPE.SAVE) {
    ctx.fillStyle = 'rgba(64, 128, 255, 0.1)';
    ctx.fillRect(0, 0, ROOM_SIZE * CELL_SIZE, ROOM_SIZE * CELL_SIZE);
  }

  if (room.type === ROOM_TYPE.GACHA) {
    ctx.fillStyle = 'rgba(240, 192, 64, 0.1)';
    ctx.fillRect(0, 0, ROOM_SIZE * CELL_SIZE, ROOM_SIZE * CELL_SIZE);
  }
}

/**
 * Get pixel position for a door direction indicator
 */
function getDoorPosition(dir) {
  const mid = Math.floor(ROOM_SIZE / 2) - 1;
  switch (dir) {
    case 'up':
      return { x: mid * CELL_SIZE, y: 0 };
    case 'down':
      return { x: mid * CELL_SIZE, y: (ROOM_SIZE - 1) * CELL_SIZE };
    case 'left':
      return { x: 0, y: mid * CELL_SIZE };
    case 'right':
      return { x: (ROOM_SIZE - 1) * CELL_SIZE, y: mid * CELL_SIZE };
    default:
      return null;
  }
}
