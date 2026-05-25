// GET /api/skills —— 列出可用 SKILL（为未来多 SKILL 扩展预留）。设计文档 §4.4.2。

import type { FastifyInstance } from "fastify";
import { readdir } from "node:fs/promises";
import { skillsDir } from "../paths.ts";

export async function skillsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/skills", async () => {
    try {
      const entries = await readdir(skillsDir, { withFileTypes: true });
      const skills = entries.filter((e) => e.isDirectory()).map((e) => e.name);
      return { skills, dir: skillsDir };
    } catch {
      return { skills: [], dir: skillsDir };
    }
  });
}
