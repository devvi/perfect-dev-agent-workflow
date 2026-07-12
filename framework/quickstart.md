# Quickstart — 30 Minutes to Your First Automated Issue

> **目标读者：** 有经验的游戏制作人，想用 AI agent 加速开发迭代。
> **前置条件：** 一个 Git 仓库、一个 Obsidian 知识库（可选）、一个 Vercel 账号（可选）。

## Step 1: Fork + 配置

```bash
# 1. Fork 这个仓库
# 2. 把你的游戏源码放进来（public/ 或 src/）
# 3. 配置项目变量
export PROJECT_ROOT=$(pwd)
export TEST_COMMAND="npm test"
export DEPLOY_URL="your-game.vercel.app"
```

## Step 2: 设置 GitHub + Hermes

```bash
# 1. GitHub webhook → 你的 Hermes gateway
#    参考 .github/workflows/ 里的配置

# 2. 确保 gh CLI 已认证
gh auth status

# 3. 配置 Vercel（如果用的话）
vercel link
vercel pull
```

## Step 3: 提第一个 Issue

用模板创建：

```
[Feature] 添加一个排行榜系统

### 工作深度
auto

### 研究选项
☐ 搜索 Obsidian 知识库（如果有的话）
```

提完 Issue，workflow 自动开始：

```
1. research → 爬代码 + 搜 Obsidian → 出 PRD → 开 PR
2. plan → 架构设计 + 测试用例 → 开 PR
3. implement → OpenCode 写代码 → 开 PR
4. CI 跑测试 → review → 合并 → 部署
```

整个过程不需要你碰命令行。

## Step 4: 引导 Research Agent

Research agent 会读取你的 Obsidian wiki 来理解你的设计风格：

```
~/workspace/Obsidian/Knowledge Ocean/wiki/
├── 体验引擎——游戏设计全景探秘.md
├── JRPG战斗系统演变.md
├── 叙事设计模式.md
└── ...
```

提 Issue 时勾选"搜索 Obsidian 知识库"，或者在正文里写"参考 wiki 里关于 xxx 的笔记"。

## Step 5: 日常使用

| 你想做什么 | 怎么做 |
|-----------|--------|
| 加一个新功能 | 提 Feature Issue |
| 修一个 Bug | 提 Bug Issue（带复现步骤） |
| 改名字/文案 | Light 深度，几分钟搞定 |
| 设计一个复杂系统 | 选 Deep 深度，research 会做 spike |
| 不想走全流程 | 等 research PR 出来，review 后手动改 |
| 部署测试 | deploy.yml 自动部署到 Vercel |

## Step 6: 写 E2E 回归测试

使用 teleport 模式（不需要按键导航整个游戏）：

```javascript
// tests/play-test.mjs — 追加回归场景
const result = await page.evaluate(() => {
  const api = window.__GAME_API__;
  api.teleport(bossRoom.x, bossRoom.y);
  api.simulateKey('Space');
  api.tick(10);
  return api.getState().gameState;
});
```

详见 `framework/ARCHITECTURE.md` 的 Teleport Testing 章节。

## 故障排查

| 现象 | 检查 |
|------|------|
| 提了 Issue 没反应 | webhook/ngrok 活着吗？`~/.hermes/workflow-pending.json` 有事件吗？ |
| PR 创建了但没合并 | PR 有 `workflow/xxx` 标签吗？没有 → stage-gate 应该自动补了 |
| CI 失败但代码看起来对 | 看具体报错，可能是测试文件里的预期值需要更新 |
| Research 没搜 Obsidian | 勾了 checkbox 吗？depth 是 standard/deep 吗？ |
| Deploy 没触发 | PR 有 `workflow/implement` 标签吗？deploy.yml 的分支名检查过了吗？ |
