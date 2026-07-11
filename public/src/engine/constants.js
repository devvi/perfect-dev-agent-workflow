// FILE: public/src/engine/constants.js
// Shared constants, enums, palette for the Metroidvania Snake Engine

// Room dimensions (matches existing grid)
export const ROOM_SIZE = 20;
export const MAP_COLS = 5;
export const MAP_ROWS = 5;
export const CELL_SIZE = 20;

// Room types
export const ROOM_TYPE = {
  NORMAL:     'normal',
  START:      'start',
  GOAL:       'goal',
  SAVE:       'save',
  HIDDEN:     'hidden',
  GACHA:      'gacha',
  KEY_SHRINE: 'key_shrine',
  BOSS:       'boss',
};

// Direction
export const DIR = {
  UP:    { x:  0, y: -1 },
  DOWN:  { x:  0, y:  1 },
  LEFT:  { x: -1, y:  0 },
  RIGHT: { x:  1, y:  0 },
};

export const DOOR_DIR = ['up', 'down', 'left', 'right'];

// Cell types within a room
export const CELL = {
  FLOOR:       0,
  WALL:        1,
  CRACKED_WALL: 2,
  DOOR:        3,
  STONE_WALL:  4,
  DEATH_WALL:  5,
  SPIKE:       6,
  BOSS_PILLAR: 'B',
};

// Door types
export const DOOR_TYPE = {
  NORMAL: 'normal',
  BOSS:   'boss',
};

// Game states
export const GAME_STATE = {
  TITLE:    'title',
  PLAYING:  'playing',
  PAUSED:   'paused',
  GAMEOVER: 'gameover',
  WON:      'won',
};

// Power-up types
export const POWER_UP_TYPE = {
  FIRE_RATE:   'fireRate',
  DAMAGE:      'damage',
  DOUBLE_SHOT: 'doubleShot',
  RANGE:       'range',
  SPEED:       'speed',
};

// Speed curve
export const BASE_TICK_INTERVAL = 150; // ms at length 3
export const SPEED_SLOPE = 0.05; // multiplier per extra length unit
export const MAX_TICK_INTERVAL = 800; // ms cap on max slowdown

// Combat defaults
export const DEFAULT_FIRE_RATE = 3;       // frames between shots
export const DEFAULT_PROJECTILE_SPEED = 2; // cells per tick
export const DEFAULT_PROJECTILE_DECAY = 10; // max travel distance
export const DEFAULT_PROJECTILE_POWER = 1; // damage per hit
export const DEFAULT_MAX_PROJECTILES = 3;

// Gacha machine
export const GACHA_COST = 5; // length cost per use

// Enemy defaults
export const DEFAULT_ENEMY_SPEED_TICKS = 2; // moves every N ticks
export const DEFAULT_CHASE_RANGE = 20; // cells
export const ENEMY_RETURN_AFTER_ROOMS = 2; // rooms away before returning home

// Rendering
export const CANVAS_SIZE = 400;
export const MINIMAP_SIZE = 100;
export const MINIMAP_MARGIN = 10;

// Stuck+Reverse mechanic (Issue #46)
export const STUCK_TICKS = 5;

// Invulnerability after enemy hit (Issue #118)
export const INVULNERABILITY_DURATION = 10; // ticks of invulnerability after enemy hit

// Boss constants (Issue #122)
export const BOSS = {
  NAME: 'Blue Hammer',
  MAX_HP: 6,
  COL_HP: 3,
  MAX_LENGTH_PER_COL: 3,
  CHARGE_WINDUP_TICKS: 5,
  CHARGE_DASH_TICKS: 5,
  CHARGE_RECOVERY_TICKS: 3,
  STUFFED_TICKS: 10,
  FOOD_DECAY_TICKS: 120,
  FOOD_FLASH_START: 80,
};

export const PILLAR_POSITIONS = [
  { cx: 3, cy: 3 },    // NW
  { cx: 15, cy: 3 },   // NE
  { cx: 3, cy: 15 },   // SW
  { cx: 15, cy: 15 },  // SE
];

// localStorage key
export const SAVE_KEY = 'snake_save';

// Palette (GameBoy inspired)
export const PALETTE = {
  BG:         '#9bbc0f',
  DARK_GREEN: '#306230',
  LIGHT_GREEN: '#9bbc0f',
  MEDIUM_GREEN: '#8bac0f',
  BLACK:      '#0f380f',
  RED:        '#e94560',
  FOOD:       '#f0c040',
  SNAKE_HEAD: '#0f380f',
  SNAKE_BODY: '#306230',
  ENEMY:      '#e94560',
  ENEMY_HEAD: '#c93050',
  GOLD:       '#f0c040',
  BLUE:       '#3060e0',
  SAVE_POINT: '#4080ff',
  CRACK:      '#ccaa88',
  FOG:        '#0a0a1a',
  MINIMAP_CURRENT: '#00ff88',
  MINIMAP_EXPLORED: '#306230',
  MINIMAP_FOG: '#0a0a1a',
  HUD_BG:     '#1a1a2e',
  HUD_TEXT:   '#e94560',
  LOCKED:     '#aa3333',
  BOSS_BLUE:  '#4488FF',
  BOSS_EYE:   '#FF4444',
  BOSS_PILLAR: '#888888',
  BOSS_DOOR:  '#FF0000',
  BOSS_HP_BAR: '#4488FF',
  BOSS_HP_BG: '#333333',
};
