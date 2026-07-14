// FILE: public/src/render/overlays.js
// Start/game-over/victory screens

import { PALETTE, CANVAS_SIZE, GAME_STATE } from '../engine/constants.js';

const MENU_ITEMS = ['START GAME', 'ABOUT'];

function truncateHash(hash) {
  if (!hash || hash === 'N/A') return 'N/A';
  return hash.length > 7 ? hash.slice(0, 7) : hash;
}

function truncateMessage(msg) {
  if (!msg || msg === 'N/A') return 'N/A';
  return msg.length > 55 ? msg.slice(0, 52) + '...' : msg;
}

/**
 * Render overlay screens (title, gameover, won)
 */
export function renderOverlay(ctx, state) {
  if (state.gameState === 'title') {
    if (state.menuMode === 'about') {
      renderAboutScreen(ctx, state);
    } else {
      renderTitleScreen(ctx, state);
    }
  } else if (state.gameState === 'gameover') {
    renderGameOverScreen(ctx, state);
  } else if (state.gameState === 'won') {
    renderVictoryScreen(ctx, state);
  } else if (state.gameState === 'paused') {
    renderPauseScreen(ctx);
  }
}

/**
 * Title screen with interactive menu
 */
function renderTitleScreen(ctx, state) {
  // Dark overlay
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  // Title
  ctx.fillStyle = PALETTE.RED;
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('🐍 完美蛇踪', CANVAS_SIZE / 2, 130);

  ctx.fillStyle = PALETTE.GOLD;
  ctx.font = '14px monospace';
  ctx.fillText('秘境探险', CANVAS_SIZE / 2, 160);

  // Subtitle
  ctx.fillStyle = '#8bac0f';
  ctx.font = '11px monospace';
  ctx.fillText('Explore. Fight. Eat. Grow.', CANVAS_SIZE / 2, 200);

  // Instructions
  ctx.fillStyle = '#ccc';
  ctx.font = '10px monospace';
  ctx.fillText('⬆ ⬇ ⬅ ➡  Move', CANVAS_SIZE / 2, 250);
  ctx.fillText('Z  Fire projectile', CANVAS_SIZE / 2, 268);
  ctx.fillText('X  Interact (gacha/save)', CANVAS_SIZE / 2, 286);
  ctx.fillText('ENTER  Select', CANVAS_SIZE / 2, 310);

  // Interactive menu
  const menuY = 340;
  const lineHeight = 22;
  MENU_ITEMS.forEach((item, i) => {
    const prefix = i === state.menuIndex ? '▶ ' : '  ';
    ctx.fillStyle = i === state.menuIndex ? PALETTE.FOOD : '#ccc';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(prefix + item, CANVAS_SIZE / 2, menuY + i * lineHeight);
  });

  // Version label (bottom-right, subtle)
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillText('v1.0.0', CANVAS_SIZE - 10, CANVAS_SIZE - 10);
  ctx.restore();
}

/**
 * About screen showing commit info
 */
function renderAboutScreen(ctx, state) {
  // Dark overlay
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = PALETTE.GOLD;
  ctx.font = '16px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ABOUT', CANVAS_SIZE / 2, 150);

  const info = state.commitInfo || { hash: 'N/A', message: 'N/A', date: 'N/A' };

  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.textAlign = 'left';
  ctx.fillText('Commit: ' + truncateHash(info.hash), 80, 200);
  ctx.fillText('Message: ' + truncateMessage(info.message), 80, 230);
  ctx.fillText('Date:  ' + info.date, 80, 270);

  ctx.fillStyle = PALETTE.FOOD;
  ctx.font = '11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('Press any key to return', CANVAS_SIZE / 2, 330);
}

/**
 * Game over screen
 */
function renderGameOverScreen(ctx, state) {
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = PALETTE.RED;
  ctx.font = '28px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('GAME OVER', CANVAS_SIZE / 2, 150);

  ctx.fillStyle = '#ccc';
  ctx.font = '14px monospace';
  ctx.fillText('Final Score: ' + state.score, CANVAS_SIZE / 2, 200);

  ctx.font = '12px monospace';
  ctx.fillText('Length: ' + state.snake.length, CANVAS_SIZE / 2, 225);
  ctx.fillText('Rooms Explored: ' + state.roomsExplored, CANVAS_SIZE / 2, 245);
  ctx.fillText('Enemies Killed: ' + state.enemiesKilled, CANVAS_SIZE / 2, 265);

  ctx.fillStyle = PALETTE.FOOD;
  ctx.font = '11px monospace';
  ctx.fillText('SPACE / ENTER to restart', CANVAS_SIZE / 2, 320);
  ctx.fillStyle = PALETTE.SAVE_POINT;
  if (state.savePoint) {
    ctx.fillText('S to load last save', CANVAS_SIZE / 2, 340);
  }
}

/**
 * Victory screen
 */
function renderVictoryScreen(ctx, state) {
  ctx.fillStyle = 'rgba(10, 10, 26, 0.85)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = PALETTE.GOLD;
  ctx.font = '24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⭐ DUNGEON CLEARED ⭐', CANVAS_SIZE / 2, 120);

  ctx.fillStyle = '#fff';
  ctx.font = '16px monospace';
  ctx.fillText('Victory!', CANVAS_SIZE / 2, 160);

  ctx.fillStyle = '#ccc';
  ctx.font = '12px monospace';
  ctx.fillText('Final Score: ' + state.score, CANVAS_SIZE / 2, 210);
  ctx.fillText('Snake Length: ' + state.snake.length, CANVAS_SIZE / 2, 230);
  ctx.fillText('Rooms Explored: ' + state.roomsExplored + '/' + (state.world.cols * state.world.rows), CANVAS_SIZE / 2, 250);
  ctx.fillText('Enemies Killed: ' + state.enemiesKilled, CANVAS_SIZE / 2, 270);

  ctx.fillStyle = PALETTE.FOOD;
  ctx.font = '11px monospace';
  ctx.fillText('SPACE / ENTER to play again', CANVAS_SIZE / 2, 320);
}

/**
 * Pause screen
 */
function renderPauseScreen(ctx) {
  ctx.fillStyle = 'rgba(10, 10, 26, 0.6)';
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = '#fff';
  ctx.font = '20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('⏸ PAUSED', CANVAS_SIZE / 2, CANVAS_SIZE / 2);

  ctx.fillStyle = '#aaa';
  ctx.font = '10px monospace';
  ctx.fillText('Press SHIFT to resume', CANVAS_SIZE / 2, CANVAS_SIZE / 2 + 30);
}
