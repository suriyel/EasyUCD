// POST /api/generate —— 简化 JSON + notes → CLI → HTML。设计文档 §4.4.2 / §4.4.4 / §7.2。

import type { FastifyInstance } from "fastify";
import { getAdapter } from "../adapters/index.ts";
import {
  extractHtml,
  type GenerateOptions,
  NotInstalledError,
  NotAuthedError,
  TimeoutError,
} from "../adapters/base.ts";
import { readSkill } from "../init.ts";
import { getActiveProfile, buildClaudeProfileEnv } from "../profiles.ts";

const MAX_ELEMENTS = 200;

// notes 在注入 prompt 前做 HTML escape（§7.2 防 prompt 注入；SKILL 中也声明 notes 仅为辅助信息）
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type Body = { elements?: unknown[]; notes?: string; cli?: string };

export async function generateRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/generate", async (req, reply) => {
    const body = (req.body ?? {}) as Body;
    const elements = Array.isArray(body.elements) ? body.elements : [];
    const cli = typeof body.cli === "string" ? body.cli : "claude";
    const notes = typeof body.notes === "string" ? body.notes : "";

    if (elements.length === 0) {
      return reply.code(400).send({ error: "empty", message: "画板为空，请先添加控件后再生成" });
    }
    if (elements.length > MAX_ELEMENTS) {
      return reply.code(413).send({
        error: "too_many_elements",
        message: `元素过多（${elements.length} > ${MAX_ELEMENTS}），建议拆分为多个页面`,
      });
    }

    const input = JSON.stringify({ elements, notes: escapeHtml(notes) }, null, 2);
    const adapter = getAdapter(cli);
    const skill = await readSkill();

    // 按激活方案派生生成选项：claude proxy → 注入 ANTHROPIC_* 并隔离宿主设置；opencode → 选模型。
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

    const started = Date.now();
    try {
      const raw = await adapter.generate(input, skill, opts);
      const elapsedMs = Date.now() - started;
      const { html, ok } = extractHtml(raw.text);
      req.log.info(
        {
          elements: elements.length,
          cli: adapter.name,
          profile: profileId,
          elapsedMs,
          tokensUsed: raw.tokensUsed ?? 0,
        },
        "generate ok",
      );
      return reply.send({
        html,
        elapsedMs,
        tokensUsed: raw.tokensUsed ?? 0,
        ...(ok ? {} : { warning: "模型输出未检测到合法 HTML，已原样返回" }),
      });
    } catch (e) {
      const elapsedMs = Date.now() - started;
      const message = (e as Error)?.message ?? String(e);
      req.log.error({ err: message, cli: adapter.name, elapsedMs }, "generate failed");
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
