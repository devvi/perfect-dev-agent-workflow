# RPi Deployment Troubleshooting

## Memory Freeze (Hard Hang)

Raspberry Pi OS ships with `cgroup_disable=memory` in the kernel cmdline. When memory runs out, the OOM killer does NOT fire — the system freezes solid instead of killing a process. No logs, no crash dump, no recovery except hard power-cycle.

### Detection
- Uptime resets (system was rebooted)
- No OOM/panic in `journalctl -k`
- `/proc/cmdline` contains `cgroup_disable=memory`

### Fix
```bash
sudo sed -i 's/$/ cgroup_memory=1/' /boot/firmware/cmdline.txt
# reboot required
```

## Memory Budget on RPi 4 (4GB)

### Baseline
| Service | Approx RAM |
|---------|-----------|
| Hermes gateway | ~420MB |
| OpenCode serve | ~325MB |
| Gitea | ~175MB |
| Docker/containerd | ~120MB |
| Ngrok + Ollama + misc | ~70MB |
| **Total** | **~1.1GB** |

### Danger zones
1. **Implement phase**: OpenCode spawns subprocesses → memory toward 3GB
2. **Overlapping cron runs**: Multiple agents concurrently
3. **LLM + subagent spawns**: delegate_task children consume additional memory

## OpenClaw Systemd Service Conflict

When migrating from OpenClaw, its systemd service often remains **enabled**:

```bash
# Check
systemctl --user is-enabled openclaw-gateway
# Disable
systemctl --user disable openclaw-gateway
```

Why it matters:
- OpenClaw also connects to Feishu → two bots handling same user's messages
- Consumes extra ~150MB+ memory + CPU
- Port 18789 (OpenClaw) vs 8644 (Hermes) — no port conflict, but resource sharing is the real issue
