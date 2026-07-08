#!/usr/bin/env node
/**
 * PiBot Webhook Server v2 — Event-driven PDA dispatcher
 *
 * Listens on port 1808, receives GitHub webhooks, routes to actions.
 * Zero npm dependencies — pure Node.js built-in modules.
 *
 * Fast actions (gh CLI direct):
 *   - PR merged → advance issue stage / trigger deploy
 *   - CI green on implement PR → auto-merge
 *
 * Heavy actions (write work order → cron launcher picks up):
 *   - Issue labeled → spawn research/plan/implement agent
 *   - CI failed → spawn self-correct agent
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
const WORK_DIR = '/tmp/pda-work-orders';
const GITHUB_REPO = 'devvi/perfect-dev-agent-workflow';

if (!SECRET) {
  console.error('FATAL: GITHUB_WEBHOOK_SECRET not set');
  process.exit(1);
}

fs.mkdirSync(LOG_DIR, { recursive: true });
fs.mkdirSync(WORK_DIR, { recursive: true });

// ============ UTILITIES ============

function log(level, msg, data) {
  const ts = new Date().toISOString();
  const entry = `[${ts}] [${level}] ${msg}${data ? ' ' + JSON.stringify(data) : ''}`;
  console.log(entry);
  try { fs.appendFileSync(path.join(LOG_DIR, 'webhook.log'), entry + '\n'); } catch(e) {}
}

function run(cmd) {
  try { return execSync(cmd, { timeout: 15000, encoding: 'utf8' }).trim(); }
  catch (e) { log('ERROR', `cmd failed: ${cmd}`, { error: e.message }); return ''; }
}

function writeWorkOrder(type, issueNum, extra) {
  const ts = Date.now();
  const file = path.join(WORK_DIR, `${type}-${issueNum}-${ts}.json`);
  const data = { type, issueNum, repo: GITHUB_REPO, ts, ...extra };
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  log('WORK_ORDER', `Created ${type} order for issue #${issueNum}`, extra);
}

function verifySignature(payload, signature) {
  if (!signature) return false;
  const sig = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  if (sig.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

// ============ EVENT HANDLERS ============

/**
 * PR merged → advance issue stage or deploy
 */
function handlePullRequest(pr, action) {
  const repo = GITHUB_REPO;
  const num = pr.number;
  const labels = (pr.labels || []).map(l => l.name);
  const branch = pr.head?.ref || '';

  if (action === 'closed' && pr.merged) {
    log('ACTION', `PR #${num} merged`, { title: pr.title, labels });

    if (labels.includes('workflow/implement')) {
      // Implement PR merged → deploy + close issue
      const match = branch.match(/implement\/(\d+)/);
      if (match) {
        const issueNum = match[1];
        log('ACTION', `Implement PR #${num} for issue #${issueNum} merged — deploying`);
        run(`gh issue close ${issueNum} -R ${repo} --comment "✅ Implemented by PR #${num}" 2>/dev/null || true`);
        run(`gh workflow run .github/workflows/deploy.yml -R ${repo} --ref master`);
      } else {
        run(`gh workflow run .github/workflows/deploy.yml -R ${repo} --ref master`);
      }
    } else if (labels.includes('workflow/plan')) {
      // Plan PR merged → advance to implement
      const match = branch.match(/plan\/(\d+)/);
      if (match) {
        const issueNum = match[1];
        log('ACTION', `Advancing issue #${issueNum} → workflow/implement`);
        run(`gh issue edit ${issueNum} -R ${repo} --add-label "workflow/implement" --remove-label "workflow/plan"`);
        // Write work order for implement agent
        writeWorkOrder('implement', issueNum, { triggeredBy: `PR #${num} merged` });
      }
    } else if (labels.includes('workflow/research')) {
      // Research PR merged → advance to plan
      const match = branch.match(/research\/(\d+)/);
      if (match) {
        const issueNum = match[1];
        log('ACTION', `Advancing issue #${issueNum} → workflow/plan`);
        run(`gh issue edit ${issueNum} -R ${repo} --add-label "workflow/plan" --remove-label "workflow/research"`);
        // Write work order for plan agent
        writeWorkOrder('plan', issueNum, { triggeredBy: `PR #${num} merged` });
      }
    }
  } else if (action === 'opened' || action === 'synchronize') {
    // New PR or push to PR — check if it's a workflow PR ready to merge
    if (labels.includes('workflow/implement')) {
      log('ACTION', `PR #${num} updated — implement`, { action });
      // Will be handled by check_run completion
    }
  }
}

/**
 * CI completed → auto-merge if green on implement PR
 */
function handleCheckSuite(suite) {
  if (suite.status !== 'completed') return;

  const repo = GITHUB_REPO;
  const branch = suite.head_branch;
  const conclusion = suite.conclusion;

  log('ACTION', `CI ${conclusion} on branch ${branch}`);

  if (conclusion === 'failure' || conclusion === 'cancelled' || conclusion === 'timed_out') {
    // CI failed — find the associated PR and spawn self-correct
    const prsOutput = run(`gh pr list -R ${repo} --head "${branch}" --json number,labels --jq '.[0]'`);
    if (!prsOutput) return;
    try {
      const prData = JSON.parse(prsOutput);
      if (prData && prData.labels?.some(l => l.name === 'workflow/implement')) {
        writeWorkOrder('self-correct', prData.number, { branch, triggeredBy: `CI ${conclusion}` });
      }
    } catch (e) {
      log('ERROR', 'Failed to parse PR info', { error: e.message });
    }
    return;
  }

  // CI success — find PR and check if auto-mergeable
  const prsOutput = run(`gh pr list -R ${repo} --head "${branch}" --json number,headRefName,labels,statusCheckRollup --jq '.[0]'`);
  if (!prsOutput) return;

  try {
    const prData = JSON.parse(prsOutput);
    if (!prData) return;

    const prLabels = (prData.labels || []).map(l => l.name);
    if (!prLabels.some(l => l.startsWith('workflow/'))) return;

    // Check all status checks
    const checks = prData.statusCheckRollup || [];
    const allGreen = checks.every(c =>
      c.conclusion === 'success' || c.conclusion === 'neutral' || c.conclusion === 'skipped'
    );

    if (allGreen) {
      log('ACTION', `All CI green on PR #${prData.number} — auto-merging`);
      run(`gh pr merge ${prData.number} -R ${repo} --squash --auto --subject "Auto-merge: ${prData.headRefName}"`);
      run(`gh pr merge ${prData.number} -R ${repo} --squash 2>/dev/null || true`);
    }
  } catch (e) {
    log('ERROR', 'Failed to process CI result', { error: e.message });
  }
}

/**
 * Check run completed — linked to a commit, find the PR
 */
function handleCheckRun(check) {
  if (check.status !== 'completed') return;

  // Try to get the check suite for branch info
  if (check.check_suite) {
    handleCheckSuite(check.check_suite);
  }
}

/**
 * Issue labeled → write work order for agent
 */
function handleIssues(issue, action, label) {
  if (action !== 'labeled' || !label) return;
  const issueNum = issue.number;

  log('ACTION', `Issue #${issueNum} labeled: ${label}`);

  const workflowLabels = ['workflow/available', 'workflow/plan', 'workflow/implement'];

  if (workflowLabels.includes(label)) {
    const orderPrefix = label === 'workflow/available' ? 'research' :
                        label === 'workflow/plan' ? 'plan' : 'implement';

    // Label the issue immediately so the pipeline shows progress
    const targetLabel = orderPrefix === 'research' ? 'workflow/research' :
                        orderPrefix === 'plan' ? 'workflow/plan' : 'workflow/implement';
    if (targetLabel !== label) {
      run(`gh issue edit ${issueNum} -R ${GITHUB_REPO} --add-label "${targetLabel}" --remove-label "${label}" 2>/dev/null`);
      log('ACTION', `Labeled issue #${issueNum} → ${targetLabel}`);
    }

    // Check for existing work orders to avoid duplicates
    const existing = fs.readdirSync(WORK_DIR)
      .filter(f => f.startsWith(`${orderPrefix}-${issueNum}-`));

    if (existing.length > 0) {
      log('ACTION', `Work order already exists for issue #${issueNum} — skipping`);
      return;
    }

    writeWorkOrder(orderPrefix, issueNum, { triggeredBy: `label ${label}` });
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
          case 'check_suite':
            handleCheckSuite(p.check_suite);
            break;
          case 'issues':
            handleIssues(p.issue, p.action, p.label?.name);
            break;
          case 'ping':
            log('INFO', 'Ping received');
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
  log('INFO', `Webhook server v2 listening on port ${PORT}, work dir: ${WORK_DIR}`);
});

process.on('SIGTERM', () => { log('INFO', 'Shutting down'); server.close(); process.exit(0); });
process.on('SIGINT', () => { log('INFO', 'Shutting down'); server.close(); process.exit(0); });
