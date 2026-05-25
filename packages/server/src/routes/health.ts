// GET /api/health —— 健康检查 + CLI 可用性探测（claude --version / opencode --version）。
// 设计文档 §4.4.2 / §7.1。

import type { FastifyInstance } from "fastify";
import { realAdapters, isMock } from "../adapters/index.ts";
import { readConfig } from "../init.ts";

export async function healthRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/health", async () => {
    const clis = await Promise.all(
      realAdapters().map(async (a) => ({ name: a.name, available: await a.available() })),
    );
    const cfg = await readConfig();
    return { ok: true, mock: isMock, defaultCli: cfg.defaultCli, clis };
  });
}
