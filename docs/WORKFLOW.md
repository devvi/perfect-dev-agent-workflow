# Workflow Documentation

## Overview

The Perfect Dev Agent Workflow is a GitHub-native, AI-driven development pipeline. Issues flow through 6 stages with automated quality gates and a self-correcting test loop.

## Quick Start

### 1. Add to Your Repo

Copy the following to your project:
```
your-project/
├── .github/
│   ├── workflows/
│   │   ├── opencode.yml
│   │   ├── opencode-review.yml
│   │   ├── research-gate.yml
│   │   └── deploy.yml
│   └── ISSUE_TEMPLATE/
│       ├── feature.yml
│       └── bug.yml
├── templates/
│   ├── PRD_TEMPLATE.md
│   ├── DESIGN_TEMPLATE.md
│   └── TASKS_TEMPLATE.md
├── scripts/
│   └── setup-labels.sh
└── AGENTS.md
```

### 2. Configure Secrets

| Secret | Purpose |
|--------|---------|
| `DEEPSEEK_API_KEY` | AI agent API key |
| `MY_GITHUB_TOKEN` | GitHub PAT with repo + PR + issues scope |

### 3. Set Up Labels

```bash
bash scripts/setup-labels.sh
```

### 4. Create an Issue

Use the Feature or Bug template. The workflow starts automatically.

## Configuration Per Project

### Test Command

Default is `npm test`. Change in `opencode-review.yml`:
```yaml
- name: Run tests
  run: |
    pytest           # or: cargo test, make test, etc.
```

### Agent Model

Default is `deepseek/deepseek-v4-flash`. Change in `opencode.yml`:
```yaml
env:
  AGENT_MODEL: your-model-here
```

### Deployment

Customize `deploy.yml` for your project's deploy target.

## Manual Commands

Comment on any issue:
- `/opencode research` — re-run research
- `/opencode plan` — re-run plan
- `/opencode implement` — re-run implementation

## Troubleshooting

### Workflow not triggering
- Check GitHub Actions is enabled for the repo
- Verify secrets are set
- Check concurrency groups aren't blocking

### Self-correct exhausting
- Agent tried 3 times, couldn't fix → `status/blocked` label added
- Read the escalation comment on the PR
- Provide clarification or manual fix
