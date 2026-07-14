// FILE: tests/201-keyboard-hints.test.js
// Test cases for Issue #201: 标题页添加键盘操作提示
// Change "ENTER  Select" → "ENTER/SPACE  Select" on title screen

import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { renderOverlay } from '../public/src/render/overlays.js';
import { CANVAS_SIZE } from '../public/src/engine/constants.js';

// =====================================================================
// UT1: Source contains the updated string ENTER/SPACE Select
// =====================================================================
describe('UT1: source contains "ENTER/SPACE  Select"', () => {
  it('has "ENTER/SPACE  Select" in overlays.js renderTitleScreen', () => {
    const source = readFileSync(
      new URL('../public/src/render/overlays.js', import.meta.url),
      'utf-8'
    );
    // The new string should appear in the file
    expect(source).toContain('ENTER/SPACE  Select');
  });
});

// =====================================================================
// UT2: Old string "ENTER  Select" is absent from renderTitleScreen
// =====================================================================
describe('UT2: old string "ENTER  Select" is replaced', () => {
  it('renderTitleScreen does NOT contain the old "ENTER  Select" without /SPACE', () => {
    const source = readFileSync(
      new URL('../public/src/render/overlays.js', import.meta.url),
      'utf-8'
    );
    // The old string without /SPACE should no longer appear.
    // However, the file may still contain "ENTER/SPACE  Select" which
    // includes "ENTER" as a substring. We need to check that there is
    // no standalone "ENTER  Select" (with double space) that is NOT part of
    // "ENTER/SPACE  Select".
    // Strategy: find all fillText calls in renderTitleScreen and ensure
    // none of them use just "ENTER  Select".
    const fillTextLines = source.match(/fillText\s*\([^)]+\)/g) || [];
    const enterSelectLines = fillTextLines.filter(
      line => line.includes("'ENTER  Select'") || line.includes('"ENTER  Select"')
    );
    expect(enterSelectLines).toHaveLength(0);
  });
});

// =====================================================================
// UT3: New string is positioned at CANVAS_SIZE/2, 310 (correct Y coord)
// =====================================================================
describe('UT3: "ENTER/SPACE  Select" positioned at correct Y coordinate', () => {
  it('uses CANVAS_SIZE / 2 for x and 310 for y', () => {
    const source = readFileSync(
      new URL('../public/src/render/overlays.js', import.meta.url),
      'utf-8'
    );
    // Find the fillText call containing ENTER/SPACE
    const match = source.match(/fillText\s*\(\s*['"]ENTER\/SPACE\s+Select['"][^)]+\)/);
    expect(match).not.toBeNull();
    const lineStart = source.lastIndexOf('\n', match.index) + 1;
    const lineEnd = source.indexOf('\n', match.index);
    const line = source.substring(lineStart, lineEnd < 0 ? source.length : lineEnd);
    expect(line).toContain('CANVAS_SIZE / 2');
    expect(line).toContain('310');
  });
});

// =====================================================================
// IT1: renderOverlay(title state) calls fillText with "ENTER/SPACE  Select"
// =====================================================================
describe('IT1: renderOverlay renders "ENTER/SPACE  Select" on title screen', () => {
  it('calls fillText with "ENTER/SPACE  Select" when rendering title screen', () => {
    const calls = [];
    const mockCtx = {
      save: () => { calls.push('save'); },
      restore: () => { calls.push('restore'); },
      fillStyle: '',
      font: '',
      textAlign: '',
      fillText: (...args) => { calls.push(['fillText', ...args]); },
      fillRect: () => { calls.push('fillRect'); },
    };

    const state = {
      gameState: 'title',
      menuMode: 'main',
      menuIndex: 0,
      commitInfo: { hash: 'abc1234', message: 'test', date: '2026-07-15' },
    };

    expect(() => renderOverlay(mockCtx, state)).not.toThrow();
    // Find the fillText call containing ENTER/SPACE  Select
    const enterSpaceCall = calls.find(
      c => Array.isArray(c) && typeof c[1] === 'string' && c[1].includes('ENTER/SPACE')
    );
    expect(enterSpaceCall).toBeDefined();
    expect(enterSpaceCall[1]).toBe('ENTER/SPACE  Select');
    // Verify coordinates
    expect(enterSpaceCall[2]).toBe(CANVAS_SIZE / 2);
    expect(enterSpaceCall[3]).toBe(310);
  });
});
