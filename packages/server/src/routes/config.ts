// GET/PUT /api/config —— 读写 CLI 偏好、暴露 SKILL 路径。设计文档 §4.4.2。

import type { FastifyInstance } from "fastify";
import { readConfig, writeConfig, type CliName } from "../init.ts";
import { skillFile } from "../paths.ts";

export async function configRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/config", async () => {
    const cfg = await readConfig();
    return { ...cfg, skillPath: skillFile };
  });

  app.put("/api/config", async (req, reply) => {
    const body = (req.body ?? {}) as { defaultCli?: string };
    const patch: Partial<{ defaultCli: CliName }> = {};
    if (body.defaultCli === "claude" || body.defaultCli === "opencode") {
      patch.defaultCli = body.defaultCli;
    }
    const next = await writeConfig(patch);
    return reply.send({ ...next, skillPath: skillFile });
  });
}
