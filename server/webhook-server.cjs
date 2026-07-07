#!/usr/bin/env node
/**
 * PiBot Webhook Server — Event-driven PDA dispatcher
 *
 * Listens on port 1808, receives GitHub webhooks, routes to actions.
 * Zero npm dependencies — pure Node.js built-in modules.
 *
 * Usage:
 *   GITHUB_WEBHOOK_SECRET=your-secret node server/webhook-server.js
 */
const http = require('http');
const crypto = require('crypto');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SECRET = process.env.GITHUB_WEBHOOK_SECRET;
const PORT = parseInt(process.env.WEBHOOK_PORT || '1808', 10);
const REPO_DIR = process.env.PDA_REPO_DIR || path.resolve(__dirname, '..');
const LOG_DIR = path.resolve(REPO_DIR, 'server/logs');
const GITHUB_REPO = 'devvi/perfect-dev-agent-workflow';

if (!SECRET) {
  console.error('FATAL: GITHUB_WEBHOOK_SECRET not set');
  process.exit(1);
}

fs.mkdirSync(LOG_DIR, { recursive: true });

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(entry);
  try { fs.appendFileSync(path.join(LOG_DIR, 'webhook.log'), entry + '\n'); } catch(e) {}
}

function verifySignature(payload, signature) {
  if (!signature) return false;
  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ============ EVENT HANDLERS ============

function handlePullRequest(pr, action) {
  if (action === 'closed' && pr.merged) {
    const labels = pr.labels.map(l => l.name);
    const repo = GITHUB_REPO;
    const num = pr.number;
    log('ACTION', `PR #${num} merged`, { title: pr.title, labels });

    if (labels.includes('workflow/implement')) {
      log('ACTION', `Implement PR merged — triggering deploy`);
      execSync(`gh workflow run .github/workflows/deploy.yml -R ${repo} --ref master`, { timeout: 15000 });
    } else {
      // advance issue stage
      const branch = pr.head.ref;
      let prefix = null;
      if (labels.includes('workflow/research')) prefix = 'research';
      else if (labels.includes('workflow/plan')) prefix = 'plan';

      if (prefix) {
        const match = branch.match(new RegExp(prefix + '/(\\d+)'));
        if (match) {
          const issueNum = match[1];
          const nextLabel = prefix === 'research' ? 'workflow/plan' : 'workflow/implement';
          const removeLabel = prefix === 'research' ? 'workflow/research' : 'workflow/plan';
          log('ACTION', `Advancing issue #${issueNum} to ${nextLabel}`);
          execSync(`gh issue edit ${issueNum} -R ${repo} --add-label "${nextLabel}" --remove-label "${removeLabel}"`, { timeout: 10000 });
        }
      }
    }
  }
}

function handleCheckRun(check) {
  if (check.status === 'completed' && check.conclusion === 'failure') {
    log('ACTION', `CI failed: ${check.name}`);
  }
}

function handleIssues(issue, action, label) {
  if (action === 'labeled' && label) {
    log('ACTION', `Issue #${issue.number} labeled: ${label}`);
  }
}

// ============ HTTP SERVER ============

const server = http.createServer((req, res) => {
  const respond = (code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  if (req.method === 'POST' && req.url === '/github-webhook') {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const signature = req.headers['x-hub-signature-256'];
      const eventType = req.headers['x-github-event'];

      if (!verifySignature(raw, signature || '')) {
        log('WARN', 'Invalid signature');
        return respond(403, { error: 'Forbidden' });
      }

      try {
        const p = JSON.parse(raw.toString('utf8'));
        log('INFO', `Received ${eventType}`, { action: p.action });

        switch (eventType) {
          case 'pull_request':
            handlePullRequest(p.pull_request, p.action);
            break;
          case 'check_run':
            handleCheckRun(p.check_run);
            break;
          case 'issues':
            handleIssues(p.issue, p.action, p.label?.name);
            break;
        }

        respond(200, { ok: true });
      } catch (e) {
        log('ERROR', 'Parse failed', { error: e.message });
        respond(400, { error: 'Bad Request' });
      }
    });
  } else if (req.method === 'GET' && req.url === '/health') {
    respond(200, { ok: true, uptime: process.uptime() });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  log('INFO', `Webhook server listening on port ${PORT}`);
});

process.on('SIGTERM', () => { log('INFO', 'Shutting down'); server.close(); process.exit(0); });
process.on('SIGINT', () => { log('INFO', 'Shutting down'); server.close(); process.exit(0); });
