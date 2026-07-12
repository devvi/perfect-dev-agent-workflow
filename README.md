# Perfect Dev Agent Workflow

**AI-driven game development workflow.** Event-driven, knowledge-aware, self-correcting.

## Two Parts

```
├─ framework/       → Reusable agent framework for game makers
│                     ARCHITECTURE.md, quickstart.md, templates, CICD copies
│
├─ (root)           → Experiment: Metroidvania Snake game
│                     public/, tests/, docs/, .github/workflows/
│
└─ .hermes/skills/  → Hermes Agent skills (research, plan, implement, review)
```

## Quick Start

```bash
# New game maker? Start here:
cat framework/quickstart.md

# Want to understand the architecture?
cat framework/ARCHITECTURE.md

# Want to see how it runs?
# Create a GitHub Issue with the template → workflow runs automatically
```

## How It Works

```
你提 Issue → research → plan → implement → CI → deploy
                 ↑
          Obsidian 知识库（你的设计笔记）
```

Each stage creates a PR. PRs auto-merge (light/standard) or await review (deep).
CI blocks merge on test failure. E2E play tests run in headless Playwright.

## Requirements

- Hermes Agent (event gateway + agent runtime)
- OpenCode Serve (:18765, LLM code generation)
- GitHub (issues, PRs, Actions)
- Vercel (deployment — optional)
- Obsidian (knowledge base — optional)
