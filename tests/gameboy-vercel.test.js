// FILE: tests/gameboy-vercel.test.js
// Vercel deployment verification tests for GameBoy 404 fix (Issue #11)
// These tests verify that the file structure and import paths are correct
// for Vercel deployment where only public/ is served.
//
// Run with: npx vitest run tests/gameboy-vercel.test.js

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Section 1: File existence — the engine must live under public/
// ---------------------------------------------------------------------------
describe('Vercel deployable file structure', () => {
  const expectedEnginePath = path.join(PROJECT_ROOT, 'public', 'src', 'gameboy-snake-engine.js');

  it('should have gameboy-snake-engine.js inside public/src/', () => {
    const exists = fs.existsSync(expectedEnginePath);
    expect(exists, `Expected ${expectedEnginePath} to exist`).toBe(true);
  });

  it('should NOT have the ONLY reference to the engine outside public/ via HTML import', () => {
    // The HTML import must be relative to public/ (./src/...) not ../src/...
    const htmlPath = path.join(PROJECT_ROOT, 'public', 'gameboy.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Should NOT contain ../src/ import (the old 404-inducing path)
    const oldPattern = /from\s+['"]\.\.\/src\/gameboy-snake-engine\.js['"]/;
    const hasOldImport = oldPattern.test(html);
    expect(hasOldImport, `gameboy.html should not import from '../src/...'`).toBe(false);

    // Should contain ./src/ import (the new Vercel-compatible path)
    const newPattern = /from\s+['"]\.\/src\/gameboy-snake-engine\.js['"]/;
    const hasNewImport = newPattern.test(html);
    expect(hasNewImport, `gameboy.html should import from './src/...'`).toBe(true);
  });

  it('should have a zero-build vercel.json (no buildCommand set)', () => {
    const vercelPath = path.join(PROJECT_ROOT, 'vercel.json');
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    expect(vercel.buildCommand).toBeNull();
    // No framework means Vercel defaults to serving public/
    expect(vercel.framework).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 2: Import integrity — the moved engine still exports everything
// ---------------------------------------------------------------------------
describe('moved engine export integrity', () => {
  it('should import successfully from the new public/src/ location', async () => {
    // This import will fail if the file doesn't exist or has syntax errors
    const engine = await import('../public/src/gameboy-snake-engine.js');
    expect(engine).toBeDefined();
  });

  it('should export all required constants', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    expect(engine.GRID_SIZE).toBe(20);
    expect(engine.TOTAL_CELLS).toBe(400);
    expect(engine.POINTS_PER_FOOD).toBe(10);
  });

  it('should export DIR with four cardinal directions', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    expect(engine.DIR).toBeDefined();
    expect(engine.DIR.UP).toEqual({ x: 0, y: -1 });
    expect(engine.DIR.DOWN).toEqual({ x: 0, y: 1 });
    expect(engine.DIR.LEFT).toEqual({ x: -1, y: 0 });
    expect(engine.DIR.RIGHT).toEqual({ x: 1, y: 0 });
  });

  it('should export all required functions', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    expect(typeof engine.createInitialState).toBe('function');
    expect(typeof engine.startGame).toBe('function');
    expect(typeof engine.resetGame).toBe('function');
    expect(typeof engine.changeDirection).toBe('function');
    expect(typeof engine.tick).toBe('function');
    expect(typeof engine.spawnFood).toBe('function');
    expect(typeof engine.checkCollision).toBe('function');
    expect(typeof engine.isVictory).toBe('function');
  });

  it('should produce valid game state from createInitialState', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    const state = engine.createInitialState();
    expect(state.gameState).toBe('idle');
    expect(state.snake).toHaveLength(3);
    expect(typeof state.score).toBe('number');
    expect(state.food).toBeDefined();
  });

  it('should correctly tick the game forward', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    let state = engine.createInitialState();
    state = engine.startGame(state);
    const initialSnakeLength = state.snake.length;
    state = engine.tick(state);
    // Snake should have moved forward one cell
    expect(state.snake[0].x).toBe(11); // was at (10, 10), moving right
    expect(state.snake).toHaveLength(initialSnakeLength); // no food eaten
  });
});

// ---------------------------------------------------------------------------
// Section 3: Path resolution safety checks
// ---------------------------------------------------------------------------
describe('deployment path safety', () => {
  it('should reference all module imports with relative paths (no absolute /src/)', () => {
    const htmlPath = path.join(PROJECT_ROOT, 'public', 'gameboy.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Find all ES module imports
    const importPattern = /from\s+['"]([^'"]+)['"]/g;
    const imports = [];
    let match;
    while ((match = importPattern.exec(html)) !== null) {
      imports.push(match[1]);
    }

    // All imports should be relative (start with ./ or ../) or bare specifiers
    // Neither ../src/... nor /src/... should appear
    for (const imp of imports) {
      // Bare specifiers like 'vitest' are fine — they appear in test files, not HTML
      // But for the HTML file specifically, nothing should reference outside public/
      if (!imp.startsWith('./') && !imp.startsWith('../')) {
        // Allow bare specifiers only if they are standard library references
        const allowedSpecifiers = ['vitest', 'node:fs', 'node:path', 'node:url'];
        expect(
          allowedSpecifiers.includes(imp),
          `Unexpected bare import '${imp}' in gameboy.html`
        ).toBe(true);
      }
    }

    // Specifically ensure no import goes up a directory from public/
    const upDirImport = imports.find(i => i.startsWith('../'));
    expect(upDirImport).toBeUndefined();
  });

  it('should have test imports pointing to the new location', async () => {
    const testPath = path.join(PROJECT_ROOT, 'tests', 'gameboy-snake.test.js');
    const testCode = fs.readFileSync(testPath, 'utf-8');

    const importMatch = testCode.match(/from\s+['"]([^'"]+)['"]/);
    // The first import should be the engine, which should now point to public/src/
    const firstImport = importMatch ? importMatch[1] : '';
    expect(firstImport).toMatch(/public\/src\/gameboy-snake-engine/);
  });
});

// ---------------------------------------------------------------------------
// Section 4: Verify backward compatibility with existing game code
// ---------------------------------------------------------------------------
describe('backward compatibility with gameboy.html rendering code', () => {
  it('should export spawnFood which the rendering code imports separately', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');
    expect(typeof engine.spawnFood).toBe('function');

    // spawnFood should return a valid grid position or null
    const snake = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }];
    const food = engine.spawnFood(snake);
    expect(food).not.toBeNull();
    expect(food.x).toBeGreaterThanOrEqual(0);
    expect(food.x).toBeLessThan(engine.GRID_SIZE);
    expect(food.y).toBeGreaterThanOrEqual(0);
    expect(food.y).toBeLessThan(engine.GRID_SIZE);
  });

  it('should handle game state lifecycle (idle → playing → gameover → idle)', async () => {
    const engine = await import('../public/src/gameboy-snake-engine.js');

    // idle → playing
    let state = engine.createInitialState();
    expect(state.gameState).toBe('idle');
    state = engine.startGame(state);
    expect(state.gameState).toBe('playing');

    // playing → gameover (drive snake into wall)
    // Set snake at the right edge moving right
    state.snake = [
      { x: 19, y: 10 },
      { x: 18, y: 10 },
      { x: 17, y: 10 },
    ];
    state.direction = engine.DIR.RIGHT;
    state.nextDirection = engine.DIR.RIGHT;
    state = engine.tick(state);
    expect(state.gameState).toBe('gameover');

    // gameover → idle (reset)
    state = engine.resetGame();
    expect(state.gameState).toBe('idle');
    expect(state.snake[0]).toEqual({ x: 10, y: 10 });
  });
});
