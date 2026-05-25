#!/usr/bin/env node
// CLI 入口：`wireframe-to-html start` → 启动本地 Fastify 服务（默认 127.0.0.1:5173）并打开浏览器。
// 服务自身负责首次初始化（复制 SKILL、写默认 config）与 CLI 可用性探测（见 /api/health）。
// 用 `node --import tsx server.ts` 运行 TypeScript，避免跨平台 .cmd shim 问题。

import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const serverPath = join(repoRoot, "packages", "server", "src", "server.ts");

const cmd = process.argv[2] ?? "start";

if (cmd === "-h" || cmd === "--help") {
  console.log(`用法:
  wireframe-to-html start     启动服务并打开浏览器（默认端口 5173）

环境变量:
  PORT        监听端口（默认 5173）
  WTH_MOCK=1  联调模式：不调用真实 CLI，返回占位 HTML`);
  process.exit(0);
}

if (cmd !== "start") {
  console.error(`未知命令: ${cmd}\n运行 wireframe-to-html --help 查看用法`);
  process.exit(1);
}

const env = { ...process.env };
if (!env.PORT) env.PORT = "5173";
env.WTH_OPEN = "1";

const child = spawn(process.execPath, ["--import", "tsx", serverPath], {
  cwd: repoRoot,
  env,
  stdio: "inherit",
});

child.on("exit", (code) => process.exit(code ?? 0));
child.on("error", (err) => {
  console.error("启动服务失败：", err);
  process.exit(1);
});
