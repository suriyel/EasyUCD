// POST /api/generate-wireframe —— 文字描述 → CLI（输出紧凑布局规格）→ Excalidraw 元素。
// 与 /api/generate 对称：那条把画板转 HTML，这条把文字转画板。

import type { FastifyInstance } from "fastify";
import { getAdapter, isMock } from "../adapters/index.ts";
import {
  extractJson,
  type GenerateOptions,
  NotInstalledError,
  NotAuthedError,
  TimeoutError,
} from "../adapters/base.ts";
import { mockWireframeControls } from "../adapters/mock.ts";
import { readWireframeSkill } from "../init.ts";
import { getActiveProfile, buildClaudeProfileEnv } from "../profiles.ts";
import { buildScene, type ControlSpec } from "../lib/build-scene.ts";

const MAX_TEXT = 8000;
const MAX_CONTROLS = 200;

// 描述文字注入 prompt 前做 HTML escape（与 /api/generate 同策略，§7.2 防注入）。
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

type Body = { text?: string; cli?: string };

export async function generateWireframeRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/generate-wireframe", async (req, reply) => {
    const body = (req.body ?? {}) as Body;
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const cli = typeof body.cli === "string" ? body.cli : "claude";

    if (!text) {
      return reply.code(400).send({ error: "empty", message: "请先输入文字描述再生成线框图" });
    }
    if (text.length > MAX_TEXT) {
      return reply.code(413).send({
        error: "too_long",
        message: `描述过长（${text.length} > ${MAX_TEXT} 字符），请精简`,
      });
    }

    const started = Date.now();
    try {
      let controls: ControlSpec[];
      let tokensUsed = 0;

      if (isMock) {
        // Mock：不调模型，按文字拼占位布局，验证全链路。
        controls = mockWireframeControls(text).controls as ControlSpec[];
      } else {
        const adapter = getAdapter(cli);
        const skill = await readWireframeSkill();

        // 与 /api/generate 相同的「激活方案」派生逻辑。
        let opts: GenerateOptions = {};
        let profileId: string | undefined;
        if (cli === "opencode") {
          const p = await getActiveProfile("opencode");
          profileId = p?.id;
          opts = { model: p?.model || undefined };
        } else {
          const p = await getActiveProfile("claude");
          profileId = p?.id;
          opts = { env: buildClaudeProfileEnv(p), isolate: p?.kind === "proxy" };
        }

        const raw = await adapter.generate(escapeHtml(text), skill, opts);
        tokensUsed = raw.tokensUsed ?? 0;
        const { json, ok } = extractJson<{ controls?: unknown[] }>(raw.text);
        const list = Array.isArray(json) ? json : Array.isArray(json?.controls) ? json!.controls : null;
        if (!ok || !list) {
          req.log.warn({ cli: adapter.name, profile: profileId }, "wireframe spec parse failed");
          return reply.code(502).send({
            error: "bad_spec",
            message: "模型未输出合法的布局规格 JSON，请重试或换用其他 CLI",
          });
        }
        controls = list as ControlSpec[];
      }

      if (controls.length > MAX_CONTROLS) controls = controls.slice(0, MAX_CONTROLS);

      const { scene, controlCount, warnings } = buildScene(controls);
      const elapsedMs = Date.now() - started;
      req.log.info({ cli: isMock ? "mock" : cli, elapsedMs, controlCount, tokensUsed }, "generate-wireframe ok");

      return reply.send({
        elements: scene.elements,
        count: controlCount,
        elapsedMs,
        tokensUsed,
        ...(warnings.length ? { warning: warnings.join("；") } : {}),
      });
    } catch (e) {
      const elapsedMs = Date.now() - started;
      const message = (e as Error)?.message ?? String(e);
      req.log.error({ err: message, cli, elapsedMs }, "generate-wireframe failed");
      if (e instanceof NotInstalledError) {
        return reply.code(503).send({
          error: "cli_not_installed",
          message,
          hint: "请安装 Claude Code（https://docs.claude.com/claude-code）或 OpenCode（https://opencode.ai）",
        });
      }
      if (e instanceof NotAuthedError) {
        return reply.code(401).send({
          error: "cli_not_authed",
          message,
          hint: cli === "opencode" ? "运行 `opencode auth login`" : "运行 `claude` 登录或 `claude setup-token`",
        });
      }
      if (e instanceof TimeoutError) {
        return reply.code(504).send({ error: "timeout", message });
      }
      return reply.code(500).send({ error: "cli_error", message });
    }
  });
}
