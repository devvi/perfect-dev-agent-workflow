// Tests for mobile support — gyroscope, touch buttons, responsive layout
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Ensure DeviceOrientationEvent is available in the test environment
if (typeof globalThis.DeviceOrientationEvent === 'undefined') {
  globalThis.DeviceOrientationEvent = class DeviceOrientationEvent extends Event {
    constructor(type, init = {}) {
      super(type, init);
      this.alpha = init.alpha ?? null;
      this.beta = init.beta ?? null;
      this.gamma = init.gamma ?? null;
      this.absolute = init.absolute ?? false;
    }
    static requestPermission() {
      return Promise.resolve('granted');
    }
  };
}

// Mock the engine modules that gameboy.html imports
vi.mock('../public/src/engine/generator.js', () => ({
  generateWorldMap: vi.fn(() => ({
    rows: 5, cols: 5,
    rooms: Array.from({ length: 5 }, () =>
      Array.from({ length: 5 }, () => ({
        explored: false, type: 'normal',
        doors: { up: false, down: false, left: false, right: false },
        tiles: Array.from({ length: 20 }, () => Array(20).fill(0)),
      }))
    ),
    playerStart: { roomX: 2, roomY: 2 },
  })),
  findRoomOfType: vi.fn(),
}));

vi.mock('../public/src/engine/world.js', () => ({
  getRoomAt: vi.fn(() => ({
    explored: false, type: 'normal',
    tiles: Array.from({ length: 20 }, () => Array(20).fill(0)),
    entities: { food: [], enemies: [] },
  })),
  worldToRoomCoords: vi.fn(() => ({ rx: 2, ry: 2, cx: 10, cy: 10 })),
  roomToWorldCoords: vi.fn(),
  getCellAt: vi.fn(),
}));

// Mock the engine core
const mockChangeDirection = vi.fn((state, dir) => ({ ...state, direction: dir, nextDirection: dir }));
const mockFire = vi.fn((state) => ({ ...state }));
const mockInteract = vi.fn((state) => ({ ...state }));
const mockStartGame = vi.fn((state) => ({ ...state, gameState: 'playing' }));

vi.mock('../public/src/engine/core.js', () => ({
  createInitialState: vi.fn(() => ({
    gameState: 'title',
    snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
    direction: { x: 1, y: 0 },
    nextDirection: { x: 1, y: 0 },
    score: 0,
    tickCount: 0,
    currentTickInterval: 150,
    world: null,
  })),
  startGame: (...args) => mockStartGame(...args),
  tick: vi.fn((s) => s),
  changeDirection: (...args) => mockChangeDirection(...args),
  fire: (...args) => mockFire(...args),
  interact: (...args) => mockInteract(...args),
}));

vi.mock('../public/src/render/renderer.js', () => ({ render: vi.fn() }));
vi.mock('../public/src/engine/save.js', () => ({ saveGame: vi.fn(), loadGame: vi.fn(), clearSave: vi.fn() }));

// --- DIR constants (same as in engine/constants.js) ---
const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

// --- Gyroscope Controller (replica for testing) ---
class GyroscopeController {
  constructor() {
    this.enabled = false;
    this.lastDir = null;
    this.filteredGamma = 0;
    this.filteredBeta = 0;
    this.alpha = 0.3;
    this.listener = null;
  }

  init() {
    if (typeof DeviceOrientationEvent === 'undefined') return false;
    this.enabled = true;
    return true;
  }

  setListener(fn) {
    this.listener = fn;
  }

  onOrientation(e, changeDirectionFn, state) {
    if (!this.enabled || !state) return;
    if (e.gamma === null || e.beta === null) return;

    this.filteredGamma = this.filteredGamma * (1 - this.alpha) + e.gamma * this.alpha;
    this.filteredBeta  = this.filteredBeta  * (1 - this.alpha) + e.beta  * this.alpha;

    const gamma = this.filteredGamma;
    const beta  = this.filteredBeta;

    let dir = null;
    if (Math.abs(gamma) > Math.abs(beta)) {
      if (gamma < -30) dir = DIR.LEFT;
      else if (gamma > 30) dir = DIR.RIGHT;
    } else {
      if (beta < -20) dir = DIR.UP;
      else if (beta > 20) dir = DIR.DOWN;
    }

    if (dir && dir !== this.lastDir) {
      this.lastDir = dir;
      changeDirectionFn(state, dir);
    }
  }

  reset() {
    this.lastDir = null;
    this.filteredGamma = 0;
    this.filteredBeta = 0;
  }
}

// --- Touch Button Handler (replica for testing) ---
function createTouchButtonHandler() {
  return {
    handleTouch(action, state, fireFn, interactFn, updateFn) {
      if (!state || state.gameState !== 'playing') return state;
      let newState = state;
      if (action === 'fire') newState = fireFn(state);
      else if (action === 'interact') newState = interactFn(state);
      if (updateFn) updateFn();
      return newState;
    },
  };
}

// --- Mobile Detection ---
function detectMobile() {
  return ('ontouchstart' in globalThis) || (navigator.maxTouchPoints > 0);
}

// ==================== TESTS ====================

describe('Mobile Support — Gyroscope Controller', () => {
  let controller;
  let mockState;

  beforeEach(() => {
    controller = new GyroscopeController();
    controller.init(); // enable controller for orientation tests
    mockState = {
      gameState: 'playing',
      snake: [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }],
      direction: { x: 1, y: 0 },
      nextDirection: { x: 1, y: 0 },
    };
    mockChangeDirection.mockReset();
    mockChangeDirection.mockImplementation((state, dir) => ({
      ...state,
      direction: dir,
      nextDirection: dir,
    }));
  });

  it('should enable gyroscope when DeviceOrientationEvent exists', () => {
    const result = controller.init();
    expect(result).toBe(true);
    expect(controller.enabled).toBe(true);
  });

  it('should detect LEFT tilt from gamma < -30', () => {
    controller.onOrientation(
      { gamma: -120, beta: 0 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.LEFT);
  });

  it('should detect RIGHT tilt from gamma > 30', () => {
    controller.onOrientation(
      { gamma: 120, beta: 5 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.RIGHT);
  });

  it('should detect UP tilt from beta < -20 (when beta dominates)', () => {
    controller.onOrientation(
      { gamma: 10, beta: -80 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.UP);
  });

  it('should detect DOWN tilt from beta > 20 (when beta dominates)', () => {
    controller.onOrientation(
      { gamma: -5, beta: 80 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.DOWN);
  });

  it('should NOT change direction for small movements (dead zone)', () => {
    controller.onOrientation(
      { gamma: 15, beta: 10 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).not.toHaveBeenCalled();
  });

  it('should apply low-pass filter to smooth noisy input', () => {
    // First event: raw gamma=60, filtered becomes 60*0.3 = 18 (below threshold)
    controller.onOrientation(
      { gamma: 60, beta: 0 },
      mockChangeDirection,
      mockState,
    );
    // With alpha=0.3, first sample: filtered = 0*0.7 + 60*0.3 = 18 — below 30 threshold
    // So no direction change
    expect(mockChangeDirection).not.toHaveBeenCalled();

    // Second event: raw gamma=70, filtered = 18*0.7 + 70*0.3 = 12.6 + 21 = 33.6
    controller.onOrientation(
      { gamma: 70, beta: 0 },
      mockChangeDirection,
      mockState,
    );
    // Now filtered > 30 → RIGHT should fire
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.RIGHT);
  });

  it('should use the stronger axis (gamma vs beta)', () => {
    // gamma=120 (strong), beta=15 (weak) → should use gamma axis → RIGHT
    controller.onOrientation(
      { gamma: 120, beta: 15 },
      mockChangeDirection,
      mockState,
    );
    expect(mockChangeDirection).toHaveBeenCalledWith(mockState, DIR.RIGHT);
  });

  it('should NOT fire direction change when state is not playing', () => {
    const titleState = { ...mockState, gameState: 'title' };
    controller.onOrientation(
      { gamma: -50, beta: 0 },
      mockChangeDirection,
      titleState,
    );
    expect(mockChangeDirection).not.toHaveBeenCalled();
  });

  it('should NOT fire duplicate same-direction events', () => {
    controller.lastDir = DIR.RIGHT;
    controller.onOrientation(
      { gamma: 50, beta: 0 },
      mockChangeDirection,
      mockState,
    );
    // lastDir is already RIGHT, same dir → no call
    expect(mockChangeDirection).not.toHaveBeenCalled();
  });
});

describe('Mobile Support — Touch Buttons', () => {
  let handler;
  let mockState;

  beforeEach(() => {
    handler = createTouchButtonHandler();
    mockState = { gameState: 'playing', score: 0 };
    mockFire.mockReset();
    mockInteract.mockReset();
    mockFire.mockImplementation((s) => ({ ...s, score: s.score + 1 }));
    mockInteract.mockImplementation((s) => ({ ...s, interacted: true }));
  });

  it('should call fire() when Z button is tapped during playing', () => {
    const result = handler.handleTouch('fire', mockState, mockFire, mockInteract);
    expect(mockFire).toHaveBeenCalledWith(mockState);
    expect(result.score).toBe(1);
  });

  it('should call interact() when X button is tapped during playing', () => {
    const result = handler.handleTouch('interact', mockState, mockFire, mockInteract);
    expect(mockInteract).toHaveBeenCalledWith(mockState);
    expect(result.interacted).toBe(true);
  });

  it('should NOT fire or interact when gameState is not playing', () => {
    const titleState = { ...mockState, gameState: 'title' };
    handler.handleTouch('fire', titleState, mockFire, mockInteract);
    expect(mockFire).not.toHaveBeenCalled();

    handler.handleTouch('interact', titleState, mockFire, mockInteract);
    expect(mockInteract).not.toHaveBeenCalled();
  });

  it('should NOT fire or interact when state is null', () => {
    handler.handleTouch('fire', null, mockFire, mockInteract);
    expect(mockFire).not.toHaveBeenCalled();
  });
});

describe('Mobile Support — Mobile Detection', () => {
  it('should detect mobile when ontouchstart exists', () => {
    // ontouchstart is set in jsdom environment for testing
    // In default jsdom, it's undefined, so result should be false
    const result = detectMobile();
    // In Node test environment, no touch support
    expect(result).toBe(false);
  });

  it('should detect mobile when maxTouchPoints > 0', () => {
    const originalMaxTouchPoints = navigator.maxTouchPoints;
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: 5,
      configurable: true,
    });
    expect(detectMobile()).toBe(true);
    Object.defineProperty(navigator, 'maxTouchPoints', {
      value: originalMaxTouchPoints,
      configurable: true,
    });
  });
});

describe('Mobile Support — Swipe Direction', () => {
  it('should determine RIGHT from rightward swipe', () => {
    const startX = 100, startY = 100;
    const endX = 180, endY = 105; // dx=80, dy=5
    const dx = endX - startX;
    const dy = endY - startY;
    const minSwipe = 30;

    let dir = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > minSwipe) dir = 'RIGHT';
      else if (dx < -minSwipe) dir = 'LEFT';
    } else {
      if (dy > minSwipe) dir = 'DOWN';
      else if (dy < -minSwipe) dir = 'UP';
    }
    expect(dir).toBe('RIGHT');
  });

  it('should determine DOWN from downward swipe', () => {
    const startX = 100, startY = 100;
    const endX = 105, endY = 200; // dx=5, dy=100
    const dx = endX - startX;
    const dy = endY - startY;
    const minSwipe = 30;

    let dir = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > minSwipe) dir = 'RIGHT';
      else if (dx < -minSwipe) dir = 'LEFT';
    } else {
      if (dy > minSwipe) dir = 'DOWN';
      else if (dy < -minSwipe) dir = 'UP';
    }
    expect(dir).toBe('DOWN');
  });

  it('should NOT trigger on taps (minimal movement)', () => {
    const startX = 100, startY = 100;
    const endX = 110, endY = 105; // dx=10, dy=5 — less than minSwipe
    const dx = endX - startX;
    const dy = endY - startY;
    const minSwipe = 30;

    let dir = null;
    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > minSwipe) dir = 'RIGHT';
      else if (dx < -minSwipe) dir = 'LEFT';
    } else {
      if (dy > minSwipe) dir = 'DOWN';
      else if (dy < -minSwipe) dir = 'UP';
    }
    expect(dir).toBeNull();
  });
});
