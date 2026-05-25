# 模型资源配置（Model Resource Configuration）

为 EasyUCD（wireframe-to-html）新增的**模型资源配置界面与逻辑**。参考 `D:\03PyDemo\TechDemos` 中 Claude Code / OpenCode 的 profile 化双供应商配置逻辑实现。

## 背景与动机

改造前，模型 / 端点配置**只能在启动服务前通过进程环境变量**（`ANTHROPIC_BASE_URL` / `ANTHROPIC_AUTH_TOKEN` / `ANTHROPIC_MODEL` / `WTH_CLAUDE_ISOLATE`）设置，没有任何界面；OpenCode 也无法选择模型。每次切换端点都要改环境变量并重启，且第三方 Anthropic 兼容端点（如 MiniMax）易因宿主 `~/.claude` 设置干扰出现 **403**。

目标：支持每个工具（Claude / OpenCode）维护多套方案、激活其一，生成时按激活方案自动注入凭证；Claude proxy 方案激活时自动 `--setting-sources project` 隔离宿主设置，根治 403。

## 数据模型与存储

新增文件 `~/.config/wireframe-to-html/models.json`（与 `config.json` 同目录，不入库）。结构对齐 TechDemos `profiles.json` 的 claude / opencode 两槽：

```ts
type ClaudeProfile = {
  id: string; name: string; kind: "login" | "proxy";
  baseUrl?: string; authToken?: string;
  models?: { primary?: string; haiku?: string; sonnet?: string; opus?: string; reasoning?: string };
};
type OpenCodeProfile = { id: string; name: string; model: string };
type ModelStore = {
  claude:   { active: string; profiles: ClaudeProfile[] };
  opencode: { active: string; profiles: OpenCodeProfile[] };
};
```

**种子默认值**（首次运行写入）：claude 默认激活 `anthropic-login`（kind=login，不注入任何 env → 沿用已登录 claude，保证默认行为不变）；另带一个 `minimax`（kind=proxy，baseUrl=`https://api.minimaxi.com/anthropic`，token 空，models 预填 MiniMax-M2.7 系列）。opencode `active: ""`、`profiles: []`。
- best-effort：种子时若进程已有 `ANTHROPIC_BASE_URL/AUTH_TOKEN/MODEL`，会回填到 minimax proxy 方案的空字段。

`config.json` 的 `defaultCli` 与 `models.json` **解耦**：前者决定默认用哪个工具（CliSelector），后者决定各工具的激活方案 / 凭证。

## 凭证注入与 403 修复机制

`buildClaudeProfileEnv(profile)`（`packages/server/src/profiles.ts`，复刻 TechDemos `server.js:428-442`）：仅 **proxy** 且仅非空值映射为子进程环境变量：

| profile 字段        | 环境变量                          |
| ------------------ | -------------------------------- |
| `baseUrl`          | `ANTHROPIC_BASE_URL`             |
| `authToken`        | `ANTHROPIC_AUTH_TOKEN`           |
| `models.primary`   | `ANTHROPIC_MODEL`                |
| `models.haiku`     | `ANTHROPIC_DEFAULT_HAIKU_MODEL`  |
| `models.sonnet`    | `ANTHROPIC_DEFAULT_SONNET_MODEL` |
| `models.opus`      | `ANTHROPIC_DEFAULT_OPUS_MODEL`   |
| `models.reasoning` | `ANTHROPIC_REASONING_MODEL`      |

外加 `API_TIMEOUT_MS=3000000`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`。`login` 或无值 → 返回 `{}`。

Claude 适配器生成时：
- 子进程 env = `{ ...cleanChildEnv(), ...opts.env }`——`cleanChildEnv()` 剥离 `CLAUDE_CODE_*`（避免被宿主 Claude Code 当成子代理），profile 的 env 最后叠加覆盖用户 shell 中同名变量。
- proxy 方案激活（`opts.isolate`）或 `WTH_CLAUDE_ISOLATE=1` 时追加 `--setting-sources project --settings {}`，跳过宿主 `~/.claude` 用户设置 → **根治第三方端点 403**。

OpenCode 适配器：方案指定 `model` 时追加 `--model <model>`。

## 改动一览

### 后端（packages/server）
- `src/profiles.ts`（新）— `models.json` 的类型 + 读写 + CRUD（`upsertProfile/deleteProfile/setActive/getActiveProfile`）+ `buildClaudeProfileEnv`。`ensureModelsInit` 首次写种子。
- `src/routes/models.ts`（新）— `GET /api/models`、`PUT /api/models/:tool/:id`、`DELETE /api/models/:tool/:id`、`POST /api/models/:tool/active`、`GET /api/models/opencode/list`（跑 `opencode models`，~5s 缓存）。
- `src/paths.ts` — `+modelsFile`。
- `src/init.ts` — `ensureInit()` 末尾 `+ensureModelsInit()`。
- `src/server.ts` — 注册 `modelsRoutes`。
- 适配器：`base.ts` 加 `GenerateOptions = { env?, isolate?, model? }` 并扩展 `generate(input, skill, opts?)`；`claude-code.ts` 合并 `opts.env` + 隔离；`opencode.ts` 加 `--model`；`mock.ts` 同步签名。
- `src/routes/generate.ts` — 按激活方案派生 opts 传入适配器，日志加 `profile`。

### 前端（packages/web）
- `src/api.ts` — 新增类型 `ModelStore/ClaudeProfile/OpenCodeProfile` 与 `getModels/saveProfile/deleteProfile/setActiveProfile/getOpencodeModels`。
- `src/components/ModelConfig.tsx`（新）— 右上角「⚙ 模型配置」弹窗：工具 Tab（Claude / OpenCode）+ 左列方案卡片列表 + 右列详情编辑（Claude login 只读说明 / proxy 含 Base URL、Auth Token、5 个模型槽；OpenCode model + datalist）+ 保存 / 设为激活 / 删除 / 新建 + dirty 切换确认。
- `src/App.tsx` — 右栏标题加按钮与弹窗开关，关闭后刷新 health。
- `src/index.css` — 模态与方案卡片样式（沿用 `#1971c2` 主色 / system-ui）。

### 删除保护（对齐 TechDemos）
内置 `anthropic-login` 与「当前激活方案」不可删除（后端返回 400）。

## API 速览

| 方法 + 路径                       | 说明                              |
| -------------------------------- | -------------------------------- |
| `GET /api/models`                | 返回整个 store（本机明文供编辑）   |
| `PUT /api/models/:tool/:id`      | 新增 / 更新方案（按 id 覆盖）       |
| `DELETE /api/models/:tool/:id`   | 删除（内置 login / active 受保护）  |
| `POST /api/models/:tool/active`  | body `{id}` 设激活                 |
| `GET /api/models/opencode/list`  | best-effort 列出 `opencode models` |

## 验证结果

- `npm run typecheck` — web + server 均通过。
- **Mock 全链路（API）**：种子默认 `login` 激活 ✓；PUT / activate / delete CRUD ✓；删「激活方案」「内置 login」均按预期 `400` 拦截 ✓；`opencode models` 取到 14 个模型 ✓。
- **真实链路（核心 403 修复）**：配置并激活 `minimax` proxy 方案 → `POST /api/generate (cli=claude)` 成功返回 **607 字符真实 HTML、5831 tokens、3.9s、无 403/401**；服务端日志 `cli:claude, profile:minimax, "generate ok"`。证明 profile 注入 + 隔离链路成立。

> 真实验证示例（在仓库外、非 mock 服务上）：
> ```powershell
> $env:WTH_DEV="1"; $env:PORT="3098"; npx tsx packages/server/src/server.ts   # 非 mock
> # PUT minimax 方案（authToken=<your-key>，已脱敏）→ POST active minimax → POST /api/generate (cli=claude)
> ```

## 备注

- 安全：token 存于用户配置目录（不入库），界面以 password 字段呈现；服务仅监听 `127.0.0.1`。本地单机场景下 `GET /api/models` 明文返回 token 以支持编辑（与 TechDemos 一致）。
- 本机验证 HTTP 服务须用 PowerShell `Invoke-RestMethod`（Bash 工具的 curl 连不到 Windows 宿主的 127.0.0.1 端口）。
- `DEP0190`（shell:true 传参）为既有行为（本机 `claude` 是 `.cmd`，需 shell 解析）；用户输入走 stdin，无注入面。
