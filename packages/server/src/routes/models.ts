// 模型资源方案 API —— 复刻 TechDemos profile 端点，挂在 /api/models 下（避免与 /api/config 冲突）。
//   GET    /api/models                  → 整个 store（localhost-only，token 明文供编辑）
//   PUT    /api/models/:tool/:id         → upsert 方案
//   DELETE /api/models/:tool/:id         → 删除（内置 login / 当前 active 受保护）
//   POST   /api/models/:tool/active      → body { id } 设激活
//   GET    /api/models/opencode/list     → best-effort 列出 `opencode models`

import type { FastifyInstance } from "fastify";
import {
  readModels,
  upsertProfile,
  deleteProfile,
  setActive,
  type ToolName,
  type ClaudeProfile,
  type OpenCodeProfile,
} from "../profiles.ts";
import { findExecutable, spawnCapture } from "../adapters/base.ts";

function isTool(t: unknown): t is ToolName {
  return t === "claude" || t === "opencode";
}

// `opencode models` 输出缓存（~5s），避免每次开弹窗都 spawn 一次。
let modelsCache: { at: number; models: string[] } | null = null;
const CACHE_MS = 5_000;

async function listOpencodeModels(): Promise<string[]> {
  if (modelsCache && Date.now() - modelsCache.at < CACHE_MS) return modelsCache.models;
  const exe = findExecutable("opencode");
  if (!exe) {
    modelsCache = { at: Date.now(), models: [] };
    return [];
  }
  try {
    const r = await spawnCapture(exe.command, ["models"], {
      timeoutMs: 15_000,
      shell: exe.isBatch,
    });
    const models =
      r.code === 0
        ? r.stdout
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
    modelsCache = { at: Date.now(), models };
    return models;
  } catch {
    modelsCache = { at: Date.now(), models: [] };
    return [];
  }
}

export async function modelsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/models", async () => {
    return await readModels();
  });

  app.get("/api/models/opencode/list", async () => {
    return { models: await listOpencodeModels() };
  });

  app.put("/api/models/:tool/:id", async (req, reply) => {
    const { tool, id } = req.params as { tool: string; id: string };
    if (!isTool(tool)) {
      return reply.code(400).send({ error: "bad_tool", message: `未知工具：${tool}` });
    }
    const body = (req.body ?? {}) as ClaudeProfile | OpenCodeProfile;
    try {
      const store = await upsertProfile(tool, id, body);
      return reply.send({ ok: true, store });
    } catch (e) {
      return reply.code(500).send({ error: "save_failed", message: (e as Error).message });
    }
  });

  app.delete("/api/models/:tool/:id", async (req, reply) => {
    const { tool, id } = req.params as { tool: string; id: string };
    if (!isTool(tool)) {
      return reply.code(400).send({ error: "bad_tool", message: `未知工具：${tool}` });
    }
    try {
      const store = await deleteProfile(tool, id);
      return reply.send({ ok: true, store });
    } catch (e) {
      return reply.code(400).send({ error: "delete_failed", message: (e as Error).message });
    }
  });

  app.post("/api/models/:tool/active", async (req, reply) => {
    const { tool } = req.params as { tool: string };
    if (!isTool(tool)) {
      return reply.code(400).send({ error: "bad_tool", message: `未知工具：${tool}` });
    }
    const { id } = (req.body ?? {}) as { id?: string };
    if (typeof id !== "string" || !id) {
      return reply.code(400).send({ error: "bad_id", message: "缺少方案 id" });
    }
    try {
      const store = await setActive(tool, id);
      return reply.send({ ok: true, store });
    } catch (e) {
      return reply.code(400).send({ error: "activate_failed", message: (e as Error).message });
    }
  });
}
