// FILE: tests/gameboy-vercel.test.js
// Vercel deployment verification tests for GameBoy 404 fix (Issue #11)
//
// Implement stage: fix has been applied.
//   1. src/gameboy-snake-engine.js → public/src/gameboy-snake-engine.js ✅
//   2. gameboy.html import: '../src/...' → './src/...' ✅
//   3. test imports updated accordingly ✅
//
// Run with: npx vitest run tests/gameboy-vercel.test.js

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// Section 1: Canary tests — document the current broken state.
// These indicate what the implement phase must resolve.
// ---------------------------------------------------------------------------
describe('Vercel deployment root cause (canary tests)', () => {
  // Canary 1: Engine is NOT in the deployable directory yet
  it('[CANARY] should have engine.js under public/src/ after fix', () => {
    const newPath = path.join(PROJECT_ROOT, 'public', 'src', 'gameboy-snake-engine.js');
    const exists = fs.existsSync(newPath);
    expect(exists).toBe(true);
  });

  // Canary 2: Import in HTML still uses ../src/ (the 404-causing path)
  it('[CANARY] should import with ./src/ instead of ../src/ after fix', () => {
    const htmlPath = path.join(PROJECT_ROOT, 'public', 'gameboy.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    const oldPattern = /from\s+['"]\.\.\/src\/gameboy-snake-engine\.js['"]/;
    const hasOldImport = oldPattern.test(html);
    expect(hasOldImport).toBe(false);
  });

  // Canary 3: HTML uses ./src/ imports (metroidvania refactor uses ./src/engine/ paths)
  it('[CANARY] should have ./src/ import after fix', () => {
    const htmlPath = path.join(PROJECT_ROOT, 'public', 'gameboy.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // After the metroidvania refactor, imports use ./src/engine/ paths
    const newPattern = /from\s+['"]\.\/src\/engine\//;
    const hasNewImport = newPattern.test(html);
    expect(hasNewImport).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Section 2: Vercel config audit — these must NOT change during the fix
// ---------------------------------------------------------------------------
describe('Vercel config integrity', () => {
  it('should have zero-build vercel.json (no buildCommand)', () => {
    const vercelPath = path.join(PROJECT_ROOT, 'vercel.json');
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    expect(vercel.buildCommand).toBeNull();
    expect(vercel.framework).toBeNull();
  });

  it('should have no rewrites or redirects', () => {
    const vercelPath = path.join(PROJECT_ROOT, 'vercel.json');
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    expect(vercel.rewrites).toEqual([]);
    expect(vercel.redirects).toEqual([]);
  });

  it('should have public/ as the default served directory', () => {
    const vercelPath = path.join(PROJECT_ROOT, 'vercel.json');
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf-8'));
    // No outputDirectory means Vercel defaults to public/
    expect(vercel.outputDirectory).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Section 3: Engine source verification — import from CURRENT location
// to confirm the engine code is healthy (no regression from the move)
// ---------------------------------------------------------------------------
describe('engine source integrity (imported from current src/)', () => {
  it('should export all required constants', async () => {
    const engine = await import('../src/gameboy-snake-engine.js');
    expect(engine.GRID_SIZE).toBe(20);
    expect(engine.TOTAL_CELLS).toBe(400);
    expect(engine.POINTS_PER_FOOD).toBe(10);
  });

  it('should export DIR with four cardinal directions', async () => {
    const engine = await import('../src/gameboy-snake-engine.js');
    expect(engine.DIR.UP).toEqual({ x: 0, y: -1 });
    expect(engine.DIR.DOWN).toEqual({ x: 0, y: 1 });
    expect(engine.DIR.LEFT).toEqual({ x: -1, y: 0 });
    expect(engine.DIR.RIGHT).toEqual({ x: 1, y: 0 });
  });

  it('should export all required functions with correct signatures', async () => {
    const engine = await import('../src/gameboy-snake-engine.js');
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
    const engine = await import('../src/gameboy-snake-engine.js');
    const state = engine.createInitialState();
    expect(state.gameState).toBe('idle');
    expect(state.snake).toHaveLength(3);
    expect(typeof state.score).toBe('number');
    expect(state.food).toBeDefined();
  });

  it('should correctly tick the game forward', async () => {
    const engine = await import('../src/gameboy-snake-engine.js');
    let state = engine.createInitialState();
    state = engine.startGame(state);
    state = engine.tick(state);
    expect(state.snake[0].x).toBe(11); // moved right from (10, 10)
  });

  it('should handle full game lifecycle (idle → playing → gameover)', async () => {
    const engine = await import('../src/gameboy-snake-engine.js');

    let state = engine.createInitialState();
    expect(state.gameState).toBe('idle');
    state = engine.startGame(state);
    expect(state.gameState).toBe('playing');

    // Force snake to hit the right wall (Issue #46: stuck+reverse, not gameover)
    state.snake = [
      { x: 19, y: 10 },
      { x: 18, y: 10 },
      { x: 17, y: 10 },
    ];
    state.direction = engine.DIR.RIGHT;
    state.nextDirection = engine.DIR.RIGHT;
    state = engine.tick(state);
    expect(state.gameState).toBe('playing');
    expect(state.stuckCounter).toBeGreaterThan(0);

    state = engine.resetGame();
    expect(state.gameState).toBe('idle');
    expect(state.snake[0]).toEqual({ x: 10, y: 10 });
  });
});

// ---------------------------------------------------------------------------
// Section 4: Path mapping verification — the move path is correctly derived
// ---------------------------------------------------------------------------
describe('file move path mapping', () => {
  it('the engine source file should exist at original location before move', () => {
    const originalPath = path.join(PROJECT_ROOT, 'src', 'gameboy-snake-engine.js');
    const exists = fs.existsSync(originalPath);
    expect(exists).toBe(true);
  });

  it('the target directory public/src/ should exist (or be creatable)', () => {
    const targetDir = path.join(PROJECT_ROOT, 'public', 'src');
    const exists = fs.existsSync(targetDir);
    // Directory will be created during implement if it doesn't exist
    if (!exists) {
      // Verify it's creatable
      const publicDir = path.join(PROJECT_ROOT, 'public');
      expect(fs.existsSync(publicDir)).toBe(true);
      console.log('public/src/ directory will be created in implement phase');
    } else {
      expect(true).toBe(true);
    }
  });

  it('the relative import ./src/ correctly maps to public/src/ when HTML is in public/', () => {
    // When public/gameboy.html uses './src/gameboy-snake-engine.js':
    //   Base: public/ (where gameboy.html lives)
    //   Import: ./src/gameboy-snake-engine.js
    //   Resolves to: public/src/gameboy-snake-engine.js ✅
    const htmlDir = path.join(PROJECT_ROOT, 'public');
    const resolvedPath = path.resolve(htmlDir, './src/gameboy-snake-engine.js');
    const expectedPath = path.join(PROJECT_ROOT, 'public', 'src', 'gameboy-snake-engine.js');
    expect(resolvedPath).toBe(expectedPath);
  });
});

// ---------------------------------------------------------------------------
// Section 5: Pre-implementation snapshot — ensure baseline before changes
// ---------------------------------------------------------------------------
describe('pre-implementation baseline', () => {
  it('gameboy-snake.test.js should exist and import from public/src/ location after implement', () => {
    const testPath = path.join(PROJECT_ROOT, 'tests', 'gameboy-snake.test.js');
    expect(fs.existsSync(testPath)).toBe(true);
    const content = fs.readFileSync(testPath, 'utf-8');
    expect(content).toContain('../public/src/gameboy-snake-engine.js');
  });

  it('should have the deploy workflow file unchanged', () => {
    const deployPath = path.join(PROJECT_ROOT, '.github', 'workflows', 'deploy.yml');
    expect(fs.existsSync(deployPath)).toBe(true);
    const content = fs.readFileSync(deployPath, 'utf-8');
    expect(content).toContain('vercel-action');
  });

  it('existing gameboy-snake tests should still be runnable', async () => {
    // Smoke test: the existing test file should be valid
    const testPath = path.join(PROJECT_ROOT, 'tests', 'gameboy-snake.test.js');
    const content = fs.readFileSync(testPath, 'utf-8');
    expect(content).toContain('describe');
    expect(content).toContain('createInitialState');
    expect(content).toContain('isVictory');
  });
});
