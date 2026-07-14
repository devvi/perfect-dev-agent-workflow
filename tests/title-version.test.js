// Tests for title screen version label (Issue #200)
// Verifies the version "v1.0.0" is rendered on the title screen
// with correct style, position, and context state management.
import { readFileSync } from 'node:fs';
import { describe, it, expect, vi, beforeAll } from 'vitest';

// Mock dependencies of overlays.js to isolate renderTitleScreen
vi.mock('../public/src/engine/constants.js', () => ({
  CANVAS_SIZE: 640,
  PALETTE: {
    RED: '#e94560',
    GOLD: '#f0c040',
    FOOD: '#f0c040',
    SAVE_POINT: '#4080ff',
  },
  GAME_STATE: {},
}));

/**
 * Create a minimal mock canvas 2D context that records all calls.
 */
function createMockCtx() {
  const calls = [];
  return {
    calls,
    save: () => { calls.push('save'); },
    restore: () => { calls.push('restore'); },
    fillStyle: null,
    font: null,
    textAlign: null,
    fillRect: (...a) => { calls.push(['fillRect', ...a]); },
    fillText: (...a) => { calls.push(['fillText', ...a]); },
    beginPath: () => { calls.push('beginPath'); },
    moveTo: (...a) => { calls.push(['moveTo', ...a]); },
    lineTo: (...a) => { calls.push(['lineTo', ...a]); },
    stroke: () => { calls.push('stroke'); },
    arc: (...a) => { calls.push(['arc', ...a]); },
    fill: () => { calls.push('fill'); },
    translate: (...a) => { calls.push(['translate', ...a]); },
    globalAlpha: 1.0,
    lineWidth: null,
    strokeStyle: null,
  };
}

describe('Title screen version label (Issue #200)', () => {
  let renderOverlay;

  beforeAll(async () => {
    const mod = await import('../public/src/render/overlays.js');
    renderOverlay = mod.renderOverlay;
  });

  describe('UT1: version text is rendered on title screen', () => {
    it('calls fillText with "v1.0.0" when gameState is title', () => {
      const ctx = createMockCtx();
      const state = {
        gameState: 'title',
        menuMode: 'main',
        menuIndex: 0,
        commitInfo: { hash: 'abc1234', message: 'test', date: '2026-07-15' },
      };

      renderOverlay(ctx, state);

      const versionCall = ctx.calls.find(
        c => Array.isArray(c) && c[0] === 'fillText' && c[1] === 'v1.0.0'
      );
      expect(versionCall).toBeDefined();
      expect(versionCall[1]).toBe('v1.0.0');
    });

    it('uses correct fillStyle "rgba(255, 255, 255, 0.3)" before rendering version text', () => {
      const source = readFileSync(
        new URL('../public/src/render/overlays.js', import.meta.url),
        'utf-8'
      );
      const lines = source.split('\n');
      const versionLineIdx = lines.findIndex(l => l.includes('v1.0.0'));
      expect(versionLineIdx).toBeGreaterThan(-1);

      // Check that fillStyle with 0.3 alpha appears before the version fillText line
      const beforeVersion = lines.slice(0, versionLineIdx).join('\n');
      expect(beforeVersion).toContain('rgba(255, 255, 255, 0.3)');
    });

    it('uses "10px monospace" font for the version label', () => {
      const source = readFileSync(
        new URL('../public/src/render/overlays.js', import.meta.url),
        'utf-8'
      );
      const lines = source.split('\n');
      const versionLineIdx = lines.findIndex(l => l.includes('v1.0.0'));
      expect(versionLineIdx).toBeGreaterThan(-1);

      const beforeVersion = lines.slice(0, versionLineIdx).join('\n');
      // Scan backwards from version line for the most recent font assignment
      const fontMatches = [...beforeVersion.matchAll(/font\s*=\s*'([^']+)'/g)];
      expect(fontMatches.length).toBeGreaterThan(0);
      const lastFont = fontMatches[fontMatches.length - 1][1];
      expect(lastFont).toBe('10px monospace');
    });
  });

  describe('UT2: version is right-aligned at bottom-right corner', () => {
    it('sets textAlign to "right" before the version fillText', () => {
      const source = readFileSync(
        new URL('../public/src/render/overlays.js', import.meta.url),
        'utf-8'
      );
      const lines = source.split('\n');
      const versionLineIdx = lines.findIndex(l => l.includes('v1.0.0'));
      expect(versionLineIdx).toBeGreaterThan(-1);

      // textAlign = 'right' should appear between save() and the fillText
      const versionBlock = lines.slice(
        Math.max(0, versionLineIdx - 6),
        versionLineIdx + 1
      ).join('\n');
      expect(versionBlock).toContain("'right'");
    });

    it('uses CANVAS_SIZE - 10 for both x and y coordinates', () => {
      const source = readFileSync(
        new URL('../public/src/render/overlays.js', import.meta.url),
        'utf-8'
      );
      const v1Match = source.match(/fillText\s*\(\s*['"]v1\.0\.0['"]/);
      expect(v1Match).not.toBeNull();

      const lineStart = source.lastIndexOf('\n', v1Match.index) + 1;
      const lineEnd = source.indexOf('\n', v1Match.index);
      const line = source.substring(lineStart, lineEnd < 0 ? source.length : lineEnd);
      expect(line).toContain('CANVAS_SIZE - 10');
    });
  });

  describe('UT3: ctx.save/ctx.restore protect context state', () => {
    it('calls save() before and restore() after the version text', () => {
      const ctx = createMockCtx();
      const state = {
        gameState: 'title',
        menuMode: 'main',
        menuIndex: 0,
        commitInfo: { hash: 'abc', message: 'test', date: '2026-07-15' },
      };

      renderOverlay(ctx, state);

      // Find the version fillText call
      const versionIdx = ctx.calls.findIndex(
        c => Array.isArray(c) && c[0] === 'fillText' && c[1] === 'v1.0.0'
      );
      expect(versionIdx).toBeGreaterThan(-1);

      // There should be a save() before the version fillText
      const beforeVersion = ctx.calls.slice(0, versionIdx);
      const saveCount = beforeVersion.filter(c => c === 'save').length;
      const restoreCount = beforeVersion.filter(c => c === 'restore').length;

      // At least one unmatched save() should exist before version text
      const netSavesBeforeVersion = saveCount - restoreCount;
      expect(netSavesBeforeVersion).toBeGreaterThanOrEqual(1);

      // After the version fillText, there should be a matching restore
      const afterVersion = ctx.calls.slice(versionIdx + 1);
      const saveAfter = afterVersion.filter(c => c === 'save').length;
      const restoreAfter = afterVersion.filter(c => c === 'restore').length;
      expect(restoreAfter).toBeGreaterThan(saveAfter);
    });

    it('source code has save() before and restore() after the v1.0.0 line', () => {
      const source = readFileSync(
        new URL('../public/src/render/overlays.js', import.meta.url),
        'utf-8'
      );
      const lines = source.split('\n');
      const versionLineIdx = lines.findIndex(l => l.includes('v1.0.0'));
      expect(versionLineIdx).toBeGreaterThan(-1);
      expect(lines.slice(0, versionLineIdx).join('\n')).toContain('save()');
      expect(lines.slice(versionLineIdx).join('\n')).toContain('restore()');
    });
  });

  describe('UT4: version is NOT rendered on non-title overlay screens', () => {
    it.each([
      ['gameover', { gameState: 'gameover', score: 0, snake: { length: 3 } }],
      ['won', { gameState: 'won', score: 100, snake: { length: 5 } }],
      ['paused', { gameState: 'paused' }],
    ])('does not render "v1.0.0" when gameState is %s', (_, stateOverrides) => {
      const ctx = createMockCtx();
      const state = {
        currentRoom: { x: 2, y: 2 },
        world: {
          rows: 5, cols: 5,
          rooms: Array.from({ length: 5 }, () =>
            Array.from({ length: 5 }, () => ({
              explored: false, type: 'normal',
              doors: { up: false, down: false, left: false, right: false },
              sizeGate: false,
            }))
          ),
        },
        ...stateOverrides,
      };

      renderOverlay(ctx, state);

      const versionCall = ctx.calls.find(
        c => Array.isArray(c) && c[0] === 'fillText' && c[1] === 'v1.0.0'
      );
      expect(versionCall).toBeUndefined();
    });
  });

  describe('UT5: about screen does NOT show version text', () => {
    it('does not render "v1.0.0" when menuMode is "about"', () => {
      const ctx = createMockCtx();
      const state = {
        gameState: 'title',
        menuMode: 'about',
        menuIndex: 0,
        commitInfo: { hash: 'abc', message: 'about screen', date: '2026-07-15' },
      };

      renderOverlay(ctx, state);

      const versionCall = ctx.calls.find(
        c => Array.isArray(c) && c[0] === 'fillText' && c[1] === 'v1.0.0'
      );
      expect(versionCall).toBeUndefined();
    });
  });
});
