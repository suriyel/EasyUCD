# wireframe-to-html（线框图转 HTML）

在纯文本大模型约束下，用「勾勒 + 文字描述」表达 UI 布局意图，自动生成 HTML 用于预览与后续开发。

左侧 Excalidraw 画板（内置预设控件库）+ 文字补充 → 前端把场景简化为 JSON → 本地 Node 服务调用本机 CLI（Claude Code / OpenCode）生成 HTML → 右侧 iframe 即时预览。

## 环境要求

- Node ≥ 18
- 任选其一（生成时需要）：[Claude Code CLI](https://docs.claude.com/claude-code) 或 [OpenCode CLI](https://opencode.ai)

## 安装与开发

```bash
npm install
npm run gen:controls      # 生成预设控件库 .excalidrawlib
npm run dev               # 前端 5273 + 后端 3001（Vite 代理 /api → 3001）
```

打开 http://localhost:5273 。

### 不消耗模型配额的全链路联调

设置环境变量 `WTH_MOCK=1` 启动后端，`/api/generate` 会走内置 Mock 适配器，根据画板元素拼出占位 HTML，不调用任何 CLI：

```bash
# PowerShell
$env:WTH_MOCK=1; $env:WTH_DEV=1; $env:PORT=3001; npx tsx packages/server/src/server.ts
```

### 对接第三方 Anthropic 兼容端点（如 MiniMax）

Claude Code 适配器直接继承服务进程的环境变量，因此无需改代码即可指向兼容端点：

```bash
# PowerShell（密钥仅放在环境变量，切勿写入任何文件）
$env:ANTHROPIC_BASE_URL="https://api.minimaxi.com/anthropic"
$env:ANTHROPIC_AUTH_TOKEN="<your-key>"   # 作为 Bearer 发送
$env:ANTHROPIC_MODEL="MiniMax-M2.7"
$env:WTH_CLAUDE_ISOLATE="1"               # 跳过宿主 ~/.claude 用户设置，避免其代理/托管配置干扰
npm start
```

说明：`WTH_CLAUDE_ISOLATE=1` 时适配器加 `--setting-sources project`，让 claude 只加载工程级设置；适配器还会自动剥离 `CLAUDE_CODE_*`，避免从某个 Claude Code 会话内启动时被当成子代理。默认（不设这些变量）走用户已登录的 claude，无需任何配置。

## 生产启动

```bash
npm run build             # 生成控件库 + 构建前端到 packages/web/dist
npm start                 # 等价于 wireframe-to-html start：Fastify 监听 127.0.0.1:5273
```

## 架构

详见 [`design-doc.md`](./design-doc.md)。关键模块：

- `packages/web` — React + Vite SPA（Excalidraw 画板、JSON 简化器、HTML 预览）
- `packages/server` — Fastify 服务（CLI 适配层、SKILL 加载、配置/健康检查）
- `assets/skills/wireframe-to-html/SKILL.md` — 注入 CLI 的生成约束（首次启动复制到 `~/.config/wireframe-to-html/`）
- `scripts/gen-controls.mjs` — 生成 `.excalidrawlib` 预设控件库

## 配置与日志

- 用户配置：`~/.config/wireframe-to-html/config.json`
- 可编辑的 SKILL：`~/.config/wireframe-to-html/skills/wireframe-to-html/SKILL.md`
- 日志：`~/.config/wireframe-to-html/logs/`
