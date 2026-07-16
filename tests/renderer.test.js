// Tests for renderer.js — minimap gameState guard
import { describe, it, expect, vi } from 'vitest';

// Mock non-minimap render modules to avoid deep engine dependency tree
vi.mock('../public/src/render/room.js', () => ({ renderRoom: vi.fn() }));
vi.mock('../public/src/render/hud.js', () => ({ renderHUD: vi.fn() }));
vi.mock('../public/src/render/overlays.js', () => ({ renderOverlay: vi.fn() }));

// Re-usable mock context for tracking canvas calls
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

const WORLD_STUB = {
  rows: 5,
  cols: 5,
  rooms: Array.from({ length: 5 }, () =>
    Array.from({ length: 5 }, () => ({
      explored: false,
      type: 'normal',
      doors: { up: false, down: false, left: false, right: false },
      sizeGate: null,
    }))
  ),
};

const STATE_STUB = {
  currentRoom: { x: 2, y: 2 },
  world: WORLD_STUB,
};

describe('render — minimap gameState guard', () => {
  it('should NOT render minimap when gameState is title', async () => {
    const { render } = await import('../public/src/render/renderer.js');
    const ctx = createMockCtx();
    render(ctx, { ...STATE_STUB, gameState: 'title' });
    // Minimap background fillRect would have offsetX=292 (400-100-8)
    const minimapFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapFillRects.length).toBe(0);
  });

  it('should NOT render minimap when gameState is gameover', async () => {
    const { render } = await import('../public/src/render/renderer.js');
    const ctx = createMockCtx();
    render(ctx, { ...STATE_STUB, gameState: 'gameover' });
    const minimapFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapFillRects.length).toBe(0);
  });

  it('should NOT render minimap when gameState is won', async () => {
    const { render } = await import('../public/src/render/renderer.js');
    const ctx = createMockCtx();
    render(ctx, { ...STATE_STUB, gameState: 'won' });
    const minimapFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapFillRects.length).toBe(0);
  });

  it('should NOT render minimap when gameState is paused', async () => {
    const { render } = await import('../public/src/render/renderer.js');
    const ctx = createMockCtx();
    render(ctx, { ...STATE_STUB, gameState: 'paused' });
    const minimapFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapFillRects.length).toBe(0);
  });

  it('should render minimap when gameState is playing', async () => {
    const { render } = await import('../public/src/render/renderer.js');
    const ctx = createMockCtx();
    render(ctx, { ...STATE_STUB, gameState: 'playing' });
    // The minimap background fillRect has offsetX=292 (400-100-8)
    const minimapFillRects = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapFillRects.length).toBeGreaterThanOrEqual(1);
  });
});

describe('render — minimap transition: playing → paused → playing', () => {
  it('should hide minimap when paused and show again when resumed', async () => {
    const { render } = await import('../public/src/render/renderer.js');

    const state = { ...STATE_STUB };

    // Playing → minimap visible
    state.gameState = 'playing';
    let ctx = createMockCtx();
    render(ctx, state);
    let minimapCalls = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapCalls.length).toBeGreaterThanOrEqual(1);

    // Paused → minimap hidden
    state.gameState = 'paused';
    ctx = createMockCtx();
    render(ctx, state);
    minimapCalls = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapCalls.length).toBe(0);

    // Playing again → minimap visible
    state.gameState = 'playing';
    ctx = createMockCtx();
    render(ctx, state);
    minimapCalls = ctx.calls.filter(
      c => Array.isArray(c) && c[0] === 'fillRect' && c[1] === 292
    );
    expect(minimapCalls.length).toBeGreaterThanOrEqual(1);
  });
});
