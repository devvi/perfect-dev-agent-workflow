// FILE: public/src/render/room.js
// Room rendering (tiles, entities)

import {
  ROOM_SIZE, CELL_SIZE, CELL, ROOM_TYPE, PALETTE, BOSS_ROOM_SIZE, BOSS_CELL_SIZE,
} from '../engine/constants.js';
import { getRoomAt, worldToRoomCoords } from '../engine/world.js';

/**
 * Render the current room (tiles, entities, snake, projectiles)
 */
export function renderRoom(ctx, state, world) {
  const room = getRoomAt(world, state.currentRoom.x, state.currentRoom.y);
  if (!room) return;

  // Determine cell size (zoom-out for boss room)
  const cellSize = room.bossRoom ? BOSS_CELL_SIZE : CELL_SIZE;
  const roomSize = room.bossRoom ? BOSS_ROOM_SIZE : ROOM_SIZE;

  // Draw tiles
  for (let cy = 0; cy < roomSize; cy++) {
    for (let cx = 0; cx < roomSize; cx++) {
      const cell = room.tiles[cy][cx];
      const px = cx * cellSize;
      const py = cy * cellSize;

      switch (cell) {
        case CELL.FLOOR:
        case CELL.DOOR:
          // Checkerboard pattern for floor
          if ((cx + cy) % 2 === 0) {
            ctx.fillStyle = room.bossRoom ? '#1a1a2e' : '#8bac0f';
            ctx.fillRect(px, py, cellSize, cellSize);
          }
          break;

        case CELL.WALL:
          ctx.fillStyle = room.bossRoom ? '#0f0f23' : PALETTE.DARK_GREEN;
          ctx.fillRect(px, py, cellSize, cellSize);
          break;

        case CELL.STONE_WALL:
          ctx.fillStyle = room.bossRoom ? '#555555' : '#1a3a1a';
          ctx.fillRect(px, py, cellSize, cellSize);
          // In boss room, mark pillar
          if (room.bossRoom) {
            ctx.fillStyle = '#777777';
            ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
          }
          break;

        case CELL.CRACKED_WALL:
          ctx.fillStyle = PALETTE.DARK_GREEN;
          ctx.fillRect(px, py, cellSize, cellSize);
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
          ctx.fillRect(px, py, cellSize, cellSize);
          // Inner highlight
          ctx.fillStyle = '#ff6633';
          ctx.beginPath();
          ctx.arc(px + cellSize / 2, py + cellSize / 2, 6, 0, Math.PI * 2);
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
          ctx.fillRect(px, py, cellSize, cellSize);
          ctx.fillStyle = '#aa3333';
          for (let s = 0; s < 3; s++) {
            const spx = px + 2 + s * 6;
            ctx.beginPath();
            ctx.moveTo(spx, py + cellSize - 2);
            ctx.lineTo(spx + 3, py + 2);
            ctx.lineTo(spx + 6, py + cellSize - 2);
            ctx.fill();
          }
          break;

        case CELL.BOSS_DOOR:
          ctx.fillStyle = '#aa2222';
          ctx.fillRect(px, py, cellSize, cellSize);
          // Red glow
          ctx.fillStyle = '#ff4444';
          ctx.font = 'bold 8px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('💀', px + cellSize / 2, py + cellSize - 2);
          break;
      }
    }
  }

  // Draw door indicators (arrows) — skip for boss room (BOSS door has special rendering)
  if (!room.bossRoom) {
    for (const dir of ['up', 'down', 'left', 'right']) {
      if (room.doors[dir]) {
        drawDoorIndicator(ctx, room, dir);
      }
    }
  }

  // Draw room type special markers
  drawRoomMarkers(ctx, room);

  // Draw food
  for (const food of room.entities.food) {
    const { cx, cy } = worldToRoomCoords(food.x, food.y);
    const px = cx * cellSize;
    const py = cy * cellSize;

    // Blink animation for food about to despawn
    if (food.despawnTicks !== undefined && food.despawnTicks <= 10) {
      const blinkFreq = food.despawnTicks <= 5 ? 1 : 2;
      if (Math.floor(food.blinkPhase / blinkFreq) % 2 === 0) {
        ctx.globalAlpha = 0.3;
      }
    }

    ctx.fillStyle = PALETTE.FOOD;
    ctx.beginPath();
    ctx.arc(px + cellSize / 2, py + cellSize / 2, Math.max(2, cellSize / 5), 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;
  }

  // Draw enemies (including boss)
  for (const enemy of room.entities.enemies) {
    if (enemy.boss) {
      drawBossEnemy(ctx, enemy, cellSize);
    } else {
      drawEnemy(ctx, enemy, cellSize);
    }
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
  const room = state.world ? getRoomAt(state.world, state.currentRoom.x, state.currentRoom.y) : null;
  const cellSize = room && room.bossRoom ? BOSS_CELL_SIZE : CELL_SIZE;

  // Flash effect when stuck (Issue #46)
  const isStuck = state.stuckCounter > 0;
  if (isStuck) {
    ctx.globalAlpha = (state.stuckCounter % 2 === 0) ? 0.4 : 1.0;
  }

  // Flash effect when invulnerable (Issue #118)
  const isInvulnerable = state.invulnerableTicks > 0;
  let skipRender = false;
  if (isInvulnerable) {
    // Toggle visibility every 2 ticks
    const flashPhase = Math.floor(state.invulnerableTicks / 2) % 2;
    if (flashPhase === 0) {
      ctx.globalAlpha = 0.4;
    } else {
      skipRender = true;
    }
  }

  for (let i = state.snake.length - 1; i >= 0; i--) {
    if (skipRender) break;
    const seg = state.snake[i];
    const { cx, cy } = worldToRoomCoords(seg.x, seg.y);
    // Only draw if in current room
    const { rx, ry } = worldToRoomCoords(seg.x, seg.y);
    if (rx !== state.currentRoom.x || ry !== state.currentRoom.y) continue;

    const px = cx * cellSize;
    const py = cy * cellSize;

    if (i === 0) {
      ctx.fillStyle = isStuck ? '#ff4444' : PALETTE.SNAKE_HEAD;
      ctx.fillRect(px + 1, py + 1, cellSize - 2, cellSize - 2);
      // Eyes
      ctx.fillStyle = '#ffffff';
      const eyeSize = Math.max(2, cellSize / 7);
      if (state.direction.y === -1) { // up
        ctx.fillRect(px + cellSize / 4, py + cellSize / 5, eyeSize, eyeSize);
        ctx.fillRect(px + cellSize * 3 / 4 - eyeSize, py + cellSize / 5, eyeSize, eyeSize);
      } else if (state.direction.y === 1) { // down
        ctx.fillRect(px + cellSize / 4, py + cellSize * 3 / 4 - eyeSize, eyeSize, eyeSize);
        ctx.fillRect(px + cellSize * 3 / 4 - eyeSize, py + cellSize * 3 / 4 - eyeSize, eyeSize, eyeSize);
      } else if (state.direction.x === -1) { // left
        ctx.fillRect(px + cellSize / 5, py + cellSize / 4, eyeSize, eyeSize);
        ctx.fillRect(px + cellSize / 5, py + cellSize * 3 / 4 - eyeSize, eyeSize, eyeSize);
      } else { // right
        ctx.fillRect(px + cellSize * 3 / 4 - eyeSize, py + cellSize / 4, eyeSize, eyeSize);
        ctx.fillRect(px + cellSize * 3 / 4 - eyeSize, py + cellSize * 3 / 4 - eyeSize, eyeSize, eyeSize);
      }
    } else {
      ctx.fillStyle = PALETTE.SNAKE_BODY;
      ctx.fillRect(px + 2, py + 2, cellSize - 4, cellSize - 4);
    }
  }
  if (isStuck || isInvulnerable) ctx.globalAlpha = 1.0;
}

/**
 * Draw an enemy
 */
function drawEnemy(ctx, enemy, cellSize) {
  for (let i = enemy.segments.length - 1; i >= 0; i--) {
    const seg = enemy.segments[i];
    const { cx: scx, cy: scy } = worldToRoomCoords(seg.x, seg.y);
    const spx = scx * cellSize;
    const spy = scy * cellSize;

    if (i === 0) {
      ctx.fillStyle = PALETTE.ENEMY_HEAD;
    } else {
      ctx.fillStyle = PALETTE.ENEMY;
    }
    ctx.fillRect(spx + 2, spy + 2, cellSize - 4, cellSize - 4);
  }

  // Draw HP indicator
  ctx.fillStyle = '#ffffff';
  ctx.font = `${Math.max(8, cellSize - 4)}px monospace`;
  ctx.textAlign = 'center';
  const { cx, cy } = worldToRoomCoords(enemy.x, enemy.y);
  ctx.fillText('❤' + enemy.hp, cx * cellSize + cellSize / 2, cy * cellSize - 2);
}

/**
 * Draw a boss enemy (Blue Hammer — double-row blue snake)
 */
function drawBossEnemy(ctx, boss, cellSize) {
  for (let i = boss.segments.length - 1; i >= 0; i--) {
    const seg = boss.segments[i];
    const { cx: scx, cy: scy } = worldToRoomCoords(seg.x, seg.y);
    const spx = scx * cellSize;
    const spy = scy * cellSize;

    // Determine if this segment is a head (front of each row)
    const isHead = (i === 0 || i === 3);
    ctx.fillStyle = isHead ? boss.headColor : boss.color;
    ctx.fillRect(spx + 1, spy + 1, cellSize - 2, cellSize - 2);

    // Draw eyes on head segments
    if (isHead) {
      ctx.fillStyle = '#ffffff';
      const eyeSize = Math.max(1, cellSize / 5);
      ctx.fillRect(spx + cellSize / 3, spy + cellSize / 4, eyeSize, eyeSize);
      ctx.fillRect(spx + cellSize / 3, spy + cellSize * 2 / 3, eyeSize, eyeSize);
    }
  }

  // Show phase indicator above boss
  if (boss.phase === 2 && boss.aiState === 'windup') {
    ctx.fillStyle = '#ffff00';
    ctx.font = `${Math.max(6, cellSize)}px monospace`;
    ctx.textAlign = 'center';
    const { cx, cy } = worldToRoomCoords(boss.x, boss.y);
    ctx.fillText('⚡', cx * cellSize + cellSize / 2, cy * cellSize - cellSize);
  }
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
