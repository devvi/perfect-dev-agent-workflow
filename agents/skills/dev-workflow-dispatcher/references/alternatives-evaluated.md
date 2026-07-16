# Workflow Alternatives Evaluated

Summary of projects evaluated as potential replacements or supplements for the perfect-dev-agent-workflow event-driven pipeline.

## Hermes Studio (EKKOLearnAI)
- **Stars**: 9k | **License**: BSL-1.1
- **Role**: Third-party Hermes web UI / desktop app
- **Features**: Platform channels GUI, file browser, usage analytics, group chat, web terminal, voice/TTS
- **Verdict**: NOT a workflow engine. Can serve as a supplementary dashboard but cannot replace the event-driven webhook → cron → operator agent architecture.

## Agent Kanban (saltbo)
- **Stars**: 395 | **License**: FSL-1.1–ALv2
- **Role**: Agent-first task board, mission control for AI workforce
- **Features**: Ed25519 agent identities, daemon-based worker dispatch, task dependencies, GitHub PR integration
- **Verdict**: Closer to a workflow system but poll-based (not event-driven), requires human to initiate, targets Claude Code/Codex runtimes (not Hermes + OpenCode). No built-in stage gating for Research→Plan→Implement pipeline.

## LangGraph (LangChain)
- **Role**: Python graph/state-machine framework for agent orchestration
- **Verdict**: A framework, not a product. Could theoretically rebuild the workflow as a Python state machine, but would require full rewrite of all GitHub/OpenCode/Feishu integration. No advantage over current Hermes cron + delegate_task architecture.

## Deep Agents (LangChain)
- **Stars**: 26k | **License**: MIT
- **Role**: Batteries-included agent harness (LangChain's answer to Claude Code / Hermes)
- **Verdict**: Another agent runtime, not a workflow engine. Has sub-agents and skills but zero cron, webhook, kanban, or messaging gateway support. Replacing Hermes with Deep Agents would mean losing all existing workflow infrastructure.

## GitHub Agentic Workflows
- **Role**: GitHub-native feature — runs coding agents in GitHub Actions from natural language descriptions
- **Verdict**: Runs on GitHub runners, not self-hosted. Not applicable for RPi-based deployments.

## Conclusion
None of these projects replace the current Hermes-based event-driven workflow architecture. The existing webhook → route script → cron poller → operator agent → sub-agents → OpenCode approach is purpose-built and more feature-complete for this specific use case.
