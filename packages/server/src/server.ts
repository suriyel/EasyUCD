// 本地 Node 服务入口（Fastify）。仅监听 127.0.0.1（§7.2）。
// 开发：WTH_DEV=1 PORT=3001，开启 CORS、不托管静态资源（Vite 负责前端）。
// 生产：默认 PORT=5173，托管 packages/web/dist 并提供 SPA 回退。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";

import { ensureInit } from "./init.ts";
import { webDist } from "./paths.ts";
import { isMock } from "./adapters/index.ts";
import { generateRoutes } from "./routes/generate.ts";
import { configRoutes } from "./routes/config.ts";
import { skillsRoutes } from "./routes/skills.ts";
import { healthRoutes } from "./routes/health.ts";

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 5173);
const DEV = process.env.WTH_DEV === "1";

function openBrowser(url: string): void {
  try {
    if (process.platform === "win32") {
      spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore" }).unref();
    } else if (process.platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).unref();
    }
  } catch {
    /* 打不开浏览器不影响服务运行 */
  }
}

async function main(): Promise<void> {
  await ensureInit();

  const app = Fastify({ logger: true, bodyLimit: 16 * 1024 * 1024 });

  if (DEV) {
    await app.register(cors, { origin: true });
  }

  await app.register(generateRoutes);
  await app.register(configRoutes);
  await app.register(skillsRoutes);
  await app.register(healthRoutes);

  if (!DEV && existsSync(webDist)) {
    await app.register(fastifyStatic, { root: webDist });
    // SPA 回退：非 /api 路径都返回 index.html
    app.setNotFoundHandler((req, reply) => {
      if ((req.raw.url ?? "").startsWith("/api")) {
        return reply.code(404).send({ error: "not_found" });
      }
      return reply.sendFile("index.html");
    });
  }

  await app.listen({ host: HOST, port: PORT });
  const url = `http://${HOST}:${PORT}`;
  app.log.info(`wireframe-to-html 服务已启动：${url}${isMock ? "  [MOCK 模式]" : ""}`);

  if (process.env.WTH_OPEN === "1") openBrowser(url);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
