# Mbot 上手指南（给 @Mbot 自己执行）

> **Step 1: 读交接文档** → 了解全貌
> 本文是交接后的实操指南，逐条执行即可。

---

## Step 1：拉取项目

```bash
cd ~/workspace
git clone https://github.com/devvi/perfect-dev-agent-workflow.git .pda/perfect-dev-agent-workflow
cd .pda/perfect-dev-agent-workflow
```

> 看 README.md 和 docs/HANDOVER.md 确认架构理解。

---

## Step 2：同步脚本到 Hermes runtime

```bash
# 把所有脚本复制到 Hermes 的执行目录
cp scripts/*.py ~/.hermes/scripts/
cp scripts/*.sh ~/.hermes/scripts/

# 同步 skill 文件到 Hermes（检查路径是否存在）
ls ~/.hermes/skills/software-development/
```

如果 skills 目录没有 game-* agent，需要从项目 link：

```bash
ln -sf ~/workspace/.pda/perfect-dev-agent-workflow/agents/skills/game-research-agent ~/.hermes/skills/software-development/
ln -sf ~/workspace/.pda/perfect-dev-agent-workflow/agents/skills/game-plan-agent ~/.hermes/skills/software-development/
ln -sf ~/workspace/.pda/perfect-dev-agent-workflow/agents/skills/game-implement-agent ~/.hermes/skills/software-development/
ln -sf ~/workspace/.pda/perfect-dev-agent-workflow/agents/skills/game-review-agent ~/.hermes/skills/software-development/
ln -sf ~/workspace/.pda/perfect-dev-agent-workflow/agents/skills/dev-workflow-dispatcher ~/.hermes/skills/software-development/
```

---

## Step 3：加载 skill

```
skill_view(name='game-research-agent')
skill_view(name='game-plan-agent')
skill_view(name='game-implement-agent')
skill_view(name='game-review-agent')
skill_view(name='dev-workflow-dispatcher')
skill_view(name='game-codebase-adaptation')
```

确认每个 skill 的内容能正常读取。

---

## Step 4：设置 workflow cron job

```bash
cronjob action=create \
  name="workflow-pending-poller" \
  schedule="every 1m" \
  deliver="local" \
  script="event-processor.py" \
  workdir="/home/pi/workspace/perfect-dev-agent-workflow"
```

验证：

```bash
cronjob action=list
```

看 `workflow-pending-poller` 的状态是否为 `scheduled`。

---

## Step 5：检查 work hours 配置

```bash
cat ~/.hermes/workflow-config.json
```

应该长这样：

```json
{
  "enabled": true,
  "work_start_hour": 23,
  "work_end_hour": 8,
  "preset": "night-owl"
}
```

如果不是，设成 night-owl（凌晨 23:00-08:00 工作）：

```bash
bash ~/workspace/.pda/perfect-dev-agent-workflow/scripts/workflow-ctl.sh hours night-owl
```

---

## Step 6：验证 workflow 能否正常跑

```bash
# 手动跑一次 event-processor
EVENT_PROCESSOR_PENDING_FILE=~/.hermes/workflow-pending.json \
  python3 ~/.hermes/scripts/event-processor.py
```

正常输出应该是：

```
SPAWN: review,issue=232,pr=232,...
SPAWN: self-correct,issue=223,pr=231,...
...
```

或者：

```
[NO_ACTIONABLE_EVENTS: run stalled scan]
```

如果报错，检查 `~/.hermes/scripts/event-processor.py` 的内容是否与项目 `scripts/` 一致。

---

## Step 7：检查当前 3 个 issue 状态

```bash
for i in 222 223 224; do
  gh issue view $i --json number,title,labels --jq "{n: .number, title: (.title[:30]), labels: [.labels[].name]}"
done
```

当前预期状态：

| Issue | 标签 | 进度 |
|-------|------|------|
| #222 | workflow/research | PR #226 待 merge |
| #223 | workflow/implement | PR #231 BLOCKED（CI 有 flaky 失败） |
| #224 | workflow/implement | PR #232 **CLEAN** ← 最优先 |

---

## Step 8：优先处理 #232（最干净的 PR）

`PR #232` 是 **CLEAN** 状态——CI 通过、分支最新。review agent 跑一下就能合。

1. 确认 event-processor 输出了 `SPAWN: review,issue=232` 或手动触发
2. 或者直接手动 merge：

```bash
gh pr merge 232 --squash --admin
```

合并后更新 GDD 文档：

```bash
# 读 DESIGN doc
cat docs/DESIGN/224-combat-rooms.md

# 更新 docs/GAME_DESIGN/03-COMBAT.md 或对应章节
git add docs/GAME_DESIGN/
git commit -m "docs: update GDD with #224 combat room design"
```

---

## Step 9：处理 #223（CI fail → self-correct）

`PR #231` CI 有失败记录。确认是否 pre-existing 失败（跟魔改无关）：

```bash
gh pr checks 231 --json name,state
```

如果是 **C2/C4 random food 的 flaky 失败**（预计中），应该：

1. 先等 event-processor 输出 `SPAWN: self-correct,issue=223,pr=231`
2. self-correct agent 会诊断失败原因 → 修复 → push
3. 等 re-CI pass → review agent 自动触发

如果 self-correct 没有自动跑，手动 rebase：

```bash
gh pr checkout 231
git pull --rebase origin master
git push --force
```

---

## Step 10：处理 #222（research PR 待合并）

PR #226 是 research PRD，卡在 BEHIND。可以直接合：

```bash
gh pr merge 226 --squash --admin
```

之后标签应该自动推进到 `workflow/plan`。

---

## Step 11：验证 Dashboard

```bash
curl -s http://localhost:8080/api/dashboard | python3 -c "
import sys,json
d=json.load(sys.stdin)
print(f'Agents: {d[\"active_agent_count\"]}')
print(f'Issues: {len(d.get(\"issues\",[]))}')
print(f'Cron: {len(d.get(\"cron_jobs\",[]))}')
print(f'Gateway: {d[\"gateway\"][\"running\"]}')
"
```

如果 dashboard 没跑起来：

```bash
# 检查系统服务
systemctl --user status workflow-dashboard

# 如果挂了，重启
systemctl --user restart workflow-dashboard

# 如果服务不存在
cd ~/workspace/.pda/perfect-dev-agent-workflow
python3 server.py &

# 或创建 systemd 服务
cat > ~/.config/systemd/user/workflow-dashboard.service << 'EOF'
[Unit]
Description=Workflow Dashboard
After=network-online.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /home/pi/workspace/.pda/perfect-dev-agent-workflow/server.py
WorkingDirectory=/home/pi/workspace/.pda/perfect-dev-agent-workflow
Restart=always

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now workflow-dashboard
```

---

## Step 12：配置 GitHub webhook

在内网环境下，ngrok 可能不适用。Mbot 需要确保：

```
GitHub repo Settings → Webhooks → 添加:
  Payload URL: http://[内网IP或域名]:8644/webhooks/dev-workflow
  Content type: application/json
  Secret: (查 ~/.hermes/env.yaml 里的 secret)
  Events: Issues, Pull requests, Check runs
```

验证 webhook 连通性：

```bash
curl -s http://localhost:8644/webhooks/github-dev-workflow -X POST \
  -H "Content-Type: application/json" \
  -d '{"action":"ping"}' | head -2
```

---

## Step 13：确认所有服务正常

```bash
echo "=== Services ==="
systemctl --user is-active hermes-gateway
systemctl --user is-active workflow-dashboard

echo "=== Ports ==="
ss -tlnp | grep -E "8644|8080|18765"

echo "=== Pending Events ==="
python3 -c "
import json
try:
    with open('/home/pi/.hermes/workflow-pending.json') as f:
        d = json.load(f)
    print(f'{len(d.get(\"events\",[]))} pending events')
    for e in d.get('events',[])[:5]:
        print(f'  {e[\"_key\"]}')
except: print('No pending file')
"

echo "=== Cron ==="
cronjob action=list

echo "=== Work Hours ==="
cat ~/.hermes/workflow-config.json

echo "=== Pause? ==="
test -f ~/.hermes/workflow-pause && echo "⏸️ PAUSED" || echo "▶️ RUNNING"
```

---

## 常见问题

### Q: event-processor 报错 "ModuleNotFoundError"
A: 脚本路径不对。确认 `~/.hermes/scripts/event-processor.py` 存在且是项目副本。

### Q: 没有 `gh` 命令
A: 安装 GitHub CLI：
```bash
sudo apt install gh
gh auth login
```

### Q: LLM 一直输出 [SILENT] 不执行 SPAWN
A: 确认 cron prompt 里没有 "use your judgment" 字样。更新 prompt：
```
cronjob action=update job_id=<id> prompt="Read script output. Execute SPAWN instructions..."
```

### Q: 时区不对（work hours 紊乱）
A: Mbot 内网的时区不一定跟 Pi 的 Asia/Shanghai 一致。检查：
```bash
date '+%Z %H:%M'
```
如果时区不同，调 `work-start-hour` 和 `work-end-hour` 适配当地时区。
