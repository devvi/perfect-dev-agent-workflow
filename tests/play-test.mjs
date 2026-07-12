/**
 * E2E Play Test — opens HTML pages in a headless browser
 * and reports runtime errors (console errors, uncaught exceptions,
 * missing module imports, canvas rendering issues).
 *
 * Usage: node tests/play-test.mjs
 * Requires: npx playwright install chromium
 */

import { chromium } from 'playwright';
import { createServer } from 'http';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const PORT = 3456;
const BASE_URL = `http://localhost:${PORT}`;
const DIR = join(fileURLToPath(import.meta.url), '..', '..');

// MIME types for ES module resolution
const MIME = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.json': 'application/json',
  '.png':  'image/png',
  '.svg':  'image/svg+xml',
};

// ── Static file server ──
// Serves from root (for src/ paths) with public/ fallback (for HTML pages)
function startServer() {
  return new Promise((resolve) => {
    const server = createServer((req, res) => {
      const urlPath = req.url === '/' ? '/index.html' : req.url.split('?')[0];
      const dirs = ['', 'public'];  // try root first, then public/
      let found = false;

      for (const prefix of dirs) {
        const filePath = join(DIR, prefix, urlPath.slice(1));
        if (existsSync(filePath)) {
          const ext = extname(filePath);
          const content = readFileSync(filePath);
          res.writeHead(200, {
            'Content-Type': MIME[ext] || 'application/octet-stream',
            'Access-Control-Allow-Origin': '*',
          });
          res.end(content);
          found = true;
          break;
        }
      }

      if (!found) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('NOT_FOUND');
      }
    });

    server.listen(PORT, () => resolve(server));
  });
}

// ── Test a single page ──
async function testPage(browser, pageName) {
  const url = `${BASE_URL}/${pageName}`;
  const errors = [];
  let pageLoaded = false;

  const page = await browser.newPage();

  // Capture console errors
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      errors.push({ type: 'console.error', text: msg.text() });
    }
  });

  // Capture uncaught exceptions
  page.on('pageerror', (err) => {
    errors.push({ type: 'uncaught', text: err.message, stack: err.stack });
  });

  // Navigate
  try {
    const resp = await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
    pageLoaded = resp !== null && resp.status() < 400;
    if (resp && resp.status() >= 400) {
      errors.push({ type: 'http_error', text: `HTTP ${resp.status()} for /${pageName}` });
    }
  } catch (navErr) {
    pageLoaded = false;
    errors.push({ type: 'navigation_failed', text: navErr.message });
  }

  // For game pages: verify canvas exists
  const isGame = pageName.toLowerCase().includes('game');
  if (pageLoaded && isGame) {
    const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
    if (canvasCount === 0) {
      errors.push({ type: 'missing_canvas', text: 'No <canvas> element found on game page' });
    }

    // Check for error messages in the DOM
    const bodyText = await page.evaluate(() => document.body.innerText);
    if (/404|Failed to load|Error|Cannot find|Module.*not found/i.test(bodyText)) {
      errors.push({ type: 'dom_error_text', text: `Error text in page body: "${bodyText.slice(0, 200)}"` });
    }

    // ── REGRESSION SCENARIOS (teleport-based) ──
    if (pageName === 'gameboy.html') {
      try {
        await page.keyboard.press('Space');
        await page.waitForTimeout(500);

        const scenarioResults = await page.evaluate(() => {
          const api = window.__GAME_API__;
          if (!api) return { error: '__GAME_API__ not available', logs: [{scenario:'api_check',status:'SKIP',detail:'API not found'}] };
          const logs = [];

          const boss = api.getBossRoom();
          if (!boss) {
            logs.push({ scenario: 'boss_teleport', status: 'SKIP', detail: 'No boss room' });
          } else {
            // First teleport to boss room
            api.teleport(boss.x, boss.y);
            // Then simulate walking in (triggers bossIntro)
            const entryResult = api.enterBossRoom();
            logs.push({ scenario: 'boss_teleport', status: entryResult === 'bossIntro' ? 'OK' : 'FAIL', detail: `enterBossRoom → ${entryResult}` });
          }

          const state1 = api.getState();
          logs.push({ scenario: 'boss_entry', status: state1.gameState === 'bossIntro' ? 'OK' : 'FAIL', detail: `state=${state1.gameState} (expected bossIntro)` });

          api.simulateKey('Space');
          const state2 = api.getState();
          logs.push({ scenario: 'boss_dismiss', status: state2.gameState === 'playing' ? 'OK' : 'FAIL', detail: `Space → ${state2.gameState}` });

          api.tick(10);
          const state3 = api.getState();
          logs.push({ scenario: 'boss_stability', status: state3 && (state3.gameState === 'playing' || state3.gameState === 'won') ? 'OK' : 'FAIL', detail: `10 ticks → ${state3 ? state3.gameState : 'null'}` });

          return { logs };
        });

        for (const r of scenarioResults.logs || []) {
          if (r.status === 'FAIL') errors.push({ type: `regression_${r.scenario}`, text: r.detail });
          else if (r.status === 'SKIP') console.log(`      ⏭️  ${r.scenario}: ${r.detail}`);
          else console.log(`      ✅ ${r.scenario}: ${r.detail}`);
        }
      } catch (regressionErr) {
        errors.push({ type: 'regression_crash', text: `Scenarios crashed: ${regressionErr.message}` });
      }
    }
    try {
      // Step 1: Start the game (Space/Enter)
      await page.keyboard.press('Space');
      await page.waitForTimeout(400);  // let 2-3 game ticks pass

      // Step 2: Move the snake
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowRight');
      await page.waitForTimeout(600);  // several ticks
      await page.keyboard.press('ArrowUp');
      await page.waitForTimeout(200);
      await page.keyboard.press('ArrowLeft');
      await page.waitForTimeout(300);

      // Step 3: Check score is rendered (even if 0, it proves game ran)
      const scoreText = await page.evaluate(() => {
        const el = document.getElementById('scoreDisplay');
        return el ? el.textContent : null;
      });

      if (scoreText === null) {
        errors.push({ type: 'playtest_no_score', text: 'Score element not found after gameplay simulation' });
      } else if (!scoreText.includes('SCORE')) {
        errors.push({ type: 'playtest_score_format', text: `Unexpected score format: "${scoreText}"` });
      } else {
        console.log(`      🎮 Gameplay OK — score display: ${scoreText}`);
      }

      // Step 4: Verify canvas has rendered content (not blank)
      const hasPixels = await page.evaluate(() => {
        const c = document.querySelector('canvas');
        if (!c) return false;
        const ctx = c.getContext('2d');
        if (!ctx) return false;
        const data = ctx.getImageData(0, 0, c.width, c.height).data;
        // Check if any non-background pixels exist
        for (let i = 3; i < data.length; i += 4) {
          if (data[i] > 0) return true; // alpha > 0 = something drawn
        }
        return false;
      });

      if (!hasPixels) {
        errors.push({ type: 'playtest_blank_canvas', text: 'Canvas is blank — no pixels rendered after gameplay simulation' });
      }
    } catch (playErr) {
      errors.push({ type: 'playtest_crash', text: `Play simulation crashed: ${playErr.message}` });
    }
  }

  await page.close();
  return { pageName, errors, loaded: pageLoaded };
}

// ── Main ──
async function main() {
  console.log('\n🎮 Play Test — opening HTML pages in headless browser\n');

  const server = await startServer();
  console.log(`   Server started on ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });

  // Discover HTML pages to test
  const publicDir = join(DIR, 'public');
  const pages = existsSync(publicDir)
    ? readdirSync(publicDir).filter(f => f.endsWith('.html'))
    : [];
  console.log(`   Found ${pages.length} HTML page(s) to test\n`);

  const results = [];

  for (const pageName of pages) {
    process.stdout.write(`📄 /${pageName} … `);
    const result = await testPage(browser, pageName);
    results.push(result);

    if (result.errors.length === 0) {
      console.log(`✅`);
    } else {
      console.log(`❌ (${result.errors.length} error(s))`);
      for (const err of result.errors) {
        console.log(`   • [${err.type}] ${err.text}`);
        if (err.stack) {
          const lines = err.stack.split('\n').slice(0, 3).join('\n     ');
          console.log(`     ${lines}`);
        }
      }
    }
  }

  await browser.close();
  await new Promise(r => server.close(r));

  // Summary
  const totalErrors = results.reduce((s, r) => s + r.errors.length, 0);
  const passed = results.filter(r => r.errors.length === 0).length;

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`📊 Play Test Results: ${passed}/${pages.length} pages passed, ${totalErrors} total errors`);
  console.log(`${'─'.repeat(50)}\n`);

  if (totalErrors > 0) process.exit(1);
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Play test crashed:', err.message);
  process.exit(1);
});
