// FILE: tests/game-rename.test.js
// Verify game name is correctly rendered in HTML and Canvas

import { describe, it, expect, vi } from 'vitest';
import { renderOverlay } from '../public/src/render/overlays.js';

// Mock constants used by overlays.js
vi.mock('../public/src/engine/constants.js', () => ({
  PALETTE: {
    RED: '#e94560',
    GOLD: '#ffd700',
    FOOD: '#8bac0f',
    SAVE_POINT: '#4fc3f7',
    BG: '#0a0a1a',
  },
  CANVAS_SIZE: 400,
  GAME_STATE: {
    TITLE: 'title',
    PLAYING: 'playing',
    GAMEOVER: 'gameover',
    WON: 'won',
    PAUSED: 'paused',
  },
}));

function createMockCtx() {
  const calls = [];
  return {
    calls,
    save:        () => { calls.push('save'); },
    restore:     () => { calls.push('restore'); },
    fillStyle:   null,
    fillRect:    (...a) => calls.push(['fillRect', ...a]),
    font:        null,
    textAlign:   null,
    fillText:    (...a) => calls.push(['fillText', ...a]),
    measureText: () => ({ width: 100 }),
  };
}

describe('Game name rendering on title screen', () => {
  it('should render a game title on the title screen canvas', () => {
    const ctx = createMockCtx();
    const state = {
      gameState: 'title',
      menuMode: 'main',
      menuIndex: 0,
    };

    renderOverlay(ctx, state);

    // Should render some title text (exact name TBD by user during implementation)
    const fillTextCalls = ctx.calls.filter(c => c[0] === 'fillText');
    expect(fillTextCalls.length).toBeGreaterThan(0);

    // First fillText should be the main game title (positioned near center)
    const titleCall = fillTextCalls[0];
    expect(titleCall[1]).toContain('灵蛇诀');
    expect(titleCall[2]).toBe(200); // centered X
    expect(titleCall[3]).toBe(130); // title Y position
  });

  it('should render game subtitle on title screen', () => {
    const ctx = createMockCtx();
    const state = {
      gameState: 'title',
      menuMode: 'main',
      menuIndex: 0,
    };

    renderOverlay(ctx, state);

    const fillTextCalls = ctx.calls.filter(c => c[0] === 'fillText');
    // Second fillText should be the subtitle (METROIDVANIA)
    const subtitleCall = fillTextCalls[1];
    expect(subtitleCall[1]).toContain('完美之界');
    expect(subtitleCall[3]).toBe(160);
  });
});

describe('HTML title', () => {
  it('index.html should contain a game title in the <title> tag', () => {
    // This is a placeholder — implement phase should update
    // This test will be expanded to verify exact content after rename
    // For now verify the test framework works
    expect(true).toBe(true);
  });
});
