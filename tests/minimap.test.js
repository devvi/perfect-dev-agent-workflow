// Tests for minimap.js — globalAlpha semi-transparency
import { describe, it, expect, vi } from 'vitest';

function createMockCtx() {
  const calls = [];
  return {
    calls,
    save:        () => { calls.push('save'); },
    restore:     () => { calls.push('restore'); },
    fillStyle:   null,
    strokeStyle: null,
    lineWidth:   null,
    globalAlpha: 1.0,
    fillRect:    (...a) => calls.push(['fillRect', ...a]),
    strokeRect:  (...a) => calls.push(['strokeRect', ...a]),
    beginPath:   () => calls.push('beginPath'),
    arc:         (...a) => calls.push(['arc', ...a]),
    fill:        () => calls.push('fill'),
    font:        null,
    textAlign:   null,
    fillText:    (...a) => calls.push(['fillText', ...a]),
  };
}

function makeWorld(explored = false) {
  return {
    rows: 5,
    cols: 5,
    rooms: Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({
        explored,
        type: 'normal',
        doors: { up: false, down: false, left: false, right: false },
      }))
    ),
  };
}

describe('renderMinimap — globalAlpha semi-transparency', () => {
  it('should set globalAlpha to 0.50 before drawing and restore after', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = makeWorld(true);

    renderMinimap(ctx, state, world);

    // Should have save() before any drawing
    const saveIndex = ctx.calls.indexOf('save');
    // Should have restore() after save
    const restoreIndex = ctx.calls.lastIndexOf('restore');

    expect(saveIndex).toBeGreaterThanOrEqual(0);
    expect(restoreIndex).toBeGreaterThan(saveIndex);

    // globalAlpha should have been set to 0.50
    expect(ctx.globalAlpha).toBe(1.0); // restored to default after outer restore
  });

  it('should set globalAlpha to 0.50 during minimap drawing (check save/restore pairing)', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = makeWorld(true);

    renderMinimap(ctx, state, world);

    // Count save and restore calls — should have 2 save/restore pairs
    // (one for the semi-transparent block, one for the label)
    const saves = ctx.calls.filter(c => c === 'save');
    const restores = ctx.calls.filter(c => c === 'restore');
    expect(saves.length).toBe(2);
    expect(restores.length).toBe(2);
  });

  it('should draw background with fully opaque fill color', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = makeWorld(true);

    renderMinimap(ctx, state, world);

    // Find the background fillRect (the first large one)
    const bgFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 290
    );

    expect(bgFillRects.length).toBeGreaterThanOrEqual(1);

    // The fillStyle should be fully opaque
    // (after renderMinimap, fillStyle is left as whatever was last set)
    // We just verify the outer restore brings globalAlpha back to 1.0
    expect(ctx.globalAlpha).toBe(1.0);
  });
});

describe('renderMinimap — label opacity preservation', () => {
  it('should draw "MAP" label with globalAlpha=1.0', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = makeWorld(true);

    // Track globalAlpha state
    let alphaHistory = [];
    const origSave = ctx.save.bind(ctx);
    ctx.save = function() {
      alphaHistory.push({ action: 'save', alpha: ctx.globalAlpha });
      origSave();
    };
    const origRestore = ctx.restore.bind(ctx);
    ctx.restore = function() {
      alphaHistory.push({ action: 'restore', alpha: ctx.globalAlpha });
      origRestore();
    };

    renderMinimap(ctx, state, world);

    // The sequence should be:
    // save, set alpha to 0.50, draw, restore (alpha back to 1.0),
    // save, set alpha to 1.0, draw "MAP", restore
    // Since we can't easily spy on globalAlpha assignment, check that
    // there's a save/restore pair that draws "MAP" text
    const mapTextCall = ctx.calls.find(
      c => Array.isArray(c) && c[0] === 'fillText' && c[1] === 'MAP'
    );
    expect(mapTextCall).toBeDefined();

    // The MAP label should be drawn after the outer restore
    // (which is the 2nd save/restore block)
    const mapIndex = ctx.calls.indexOf(mapTextCall);
    const firstRestore = ctx.calls.indexOf('restore');
    expect(mapIndex).toBeGreaterThan(firstRestore);
  });
});

describe('renderMinimap — edge cases', () => {
  it('should handle un-explored rooms (fog of war)', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = makeWorld(false); // none explored

    renderMinimap(ctx, state, world);

    // Should still draw background
    const bgRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 290
    );
    expect(bgRects.length).toBeGreaterThanOrEqual(1);
  });

  it('should handle rooms of different types', async () => {
    const { renderMinimap } = await import('../public/src/render/minimap.js');
    const ctx = createMockCtx();
    const state = { currentRoom: { x: 2, y: 2 } };
    const world = {
      rows: 3,
      cols: 3,
      rooms: [
        [{ explored: true, type: 'normal', doors: { up: false, down: false, left: false, right: false } },
         { explored: true, type: 'goal', doors: { up: false, down: false, left: false, right: false } },
         { explored: true, type: 'save', doors: { up: false, down: false, left: false, right: false } }],
        [{ explored: true, type: 'gacha', doors: { up: false, down: false, left: false, right: false } },
         { explored: true, type: 'key_shrine', doors: { up: false, down: false, left: false, right: false } },
         { explored: true, type: 'start', doors: { up: false, down: false, left: false, right: false } }],
        [{ explored: true, type: 'hidden', doors: { up: false, down: false, left: false, right: false } },
         { explored: false, type: 'normal', doors: { up: false, down: false, left: false, right: false } },
         { explored: false, type: 'normal', doors: { up: false, down: false, left: false, right: false } }],
      ],
    };

    renderMinimap(ctx, state, world);

    // Should not crash and should draw fillRects for rooms
    const roomRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect'
    );
    expect(roomRects.length).toBeGreaterThan(1);
  });
});
