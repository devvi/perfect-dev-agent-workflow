# Perfect Dev Agent Workflow

AI-driven development workflow for autonomous coding agents.

```
Issue created ──→ Research ──→ Plan ──→ Implement ──→ Test ──→ Deploy
                     ↑                       │            │
                     └───────────────────────┘            │
                              Self-correct ←──────────────┘
```

## Workflow Stages

| Stage | Trigger | Output | Label |
|-------|---------|--------|-------|
| **Research** | Issue opened | `docs/PRD/`, `docs/TASKS/`, Research PR | `workflow/research` |
| **Plan** | Research PR merged | `docs/DESIGN/`, Plan Issue, Plan PR | `workflow/plan` |
| **Implement** | Plan PR merged | Code, Test PR | `workflow/implement` |
| **Test** | Implement complete | Test report | `workflow/test` |
| **Self-correct** | Tests failing | Fixes (max 3 attempts) | `workflow/self-correct` |
| **Deploy** | Tests passing | Merged + deployed | `workflow/deploy` |

## Key Principles

- **TDD mandatory** — test cases written before implementation
- **Self-correcting** — failed tests trigger auto-fix (3 attempts, then escalate)
- **Quality-gated** — research must pass completeness check before plan phase
- **Documented** — every stage produces committed docs in `docs/`
- **Auditable** — all decisions traceable through Issues, PRs, and commits

## Quick Start

1. Apply this workflow to your repo by adding it as a submodule or copying the `.github/` directory
2. Configure your AI agent in `.github/workflows/opencode.yml`
3. Set up GitHub secrets: `DEEPSEEK_API_KEY`, `MY_GITHUB_TOKEN`
4. Create an Issue — the workflow auto-starts

## Project Structure

```
project/
├── .github/
│   ├── workflows/          # CI/CD pipelines
│   │   ├── opencode.yml    # Main workflow (research→plan→implement)
│   │   ├── opencode-review.yml  # Self-healing CI + auto-review
│   │   ├── research-gate.yml    # Research quality validation
│   │   └── deploy.yml      # Deployment pipeline
│   └── ISSUE_TEMPLATE/     # Standardized issue templates
├── docs/
│   ├── PRD/                # Product requirements (research output)
│   ├── DESIGN/             # Architecture & design decisions
│   ├── TASKS/              # Phased task breakdowns
│   └── REFERENCE/          # Project-wide reference docs
├── templates/
│   └── RESEARCH_TEMPLATE.md  # Standardized research template
└── AGENTS.md               # Agent instructions (workflow definition)
```

## License

MIT
