// CLI 适配层公共部分：接口、错误类型、可执行文件解析、安全 spawn、HTML 提取。
// 设计文档 §4.4.3 / §7.2。

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join, delimiter } from "node:path";

// 生成调用的子进程超时（毫秒）。精美风格输出明显更慢，默认 300s；
// 可用环境变量 WTH_GEN_TIMEOUT_MS 覆盖（非正数/非法值回退默认）。
export const GEN_TIMEOUT_MS = (() => {
  const n = Number(process.env.WTH_GEN_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 300_000;
})();

export type GenerateRaw = {
  /** 模型输出的文本（claude 已从 JSON 中取出 result） */
  text: string;
  tokensUsed?: number;
  costUsd?: number;
};

/**
 * 生成选项：由 generate 路由按「激活方案」解析后传入。
 * - env：要叠加到子进程环境的变量（claude proxy 方案的 ANTHROPIC_* 等）
 * - isolate：claude 是否加 --setting-sources project 隔离宿主 ~/.claude 设置
 * - model：opencode 选用的 provider/model
 */
export type GenerateOptions = {
  env?: Record<string, string>;
  isolate?: boolean;
  model?: string;
};

export interface CliAdapter {
  name: string;
  available(): Promise<boolean>;
  /** input = 简化 JSON + notes 的字符串；skill = SKILL.md 内容；opts = 激活方案派生选项 */
  generate(input: string, skill: string, opts?: GenerateOptions): Promise<GenerateRaw>;
}

export class NotInstalledError extends Error {}
export class NotAuthedError extends Error {}
export class TimeoutError extends Error {}
export class CliError extends Error {}

export type ResolvedExe = { /** 启动用的命令（.exe 用全路径；.cmd 用裸名 + shell） */ command: string; isBatch: boolean } | null;

/**
 * 在 PATH 中解析可执行文件。
 * Windows：优先 .exe（可直接 spawn，无需 shell）；退而求其次 .cmd/.bat（需 shell:true）。
 */
export function findExecutable(name: string): ResolvedExe {
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  if (process.platform !== "win32") {
    for (const d of dirs) {
      const p = join(d, name);
      if (existsSync(p)) return { command: p, isBatch: false };
    }
    return { command: name, isBatch: false }; // 交给 spawn 解析
  }
  const exts = (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase());
  const preferred = [".exe", ".com"];
  const ordered = [...preferred, ...exts.filter((e) => !preferred.includes(e))];
  for (const dir of dirs) {
    for (const ext of ordered) {
      const p = join(dir, name + ext);
      if (existsSync(p)) {
        const isBatch = /\.(cmd|bat)$/i.test(ext);
        // .exe → 用全路径无 shell；.cmd/.bat → 用裸名 + shell（cmd.exe 经 PATHEXT 解析）
        return { command: isBatch ? name : p, isBatch };
      }
    }
  }
  return null;
}

/**
 * 构造子进程环境：剥离 CLAUDE_CODE_* / CLAUDECODE。
 * 这些变量由“宿主 Claude Code”在 spawn 本服务时注入；若被子 claude 继承，
 * 子进程会误以为自己是某个 claude 的子代理，从而拒绝自定义 base_url（返回 403）。
 * 普通用户从普通终端启动时这些变量本就不存在，此处只是更稳健。
 */
export function cleanChildEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const k of Object.keys(env)) {
    if (k === "CLAUDECODE" || k.startsWith("CLAUDE_CODE_")) delete env[k];
  }
  return env;
}

export type SpawnResult = { code: number | null; stdout: string; stderr: string; timedOut: boolean };

export function spawnCapture(
  command: string,
  args: string[],
  opts: { timeoutMs?: number; stdin?: string; shell?: boolean; env?: NodeJS.ProcessEnv } = {},
): Promise<SpawnResult> {
  const { timeoutMs = 120_000, stdin, shell = false, env } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { shell, windowsHide: true, env: env ?? process.env });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on("error", (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    });
    child.stdout?.on("data", (d) => (stdout += d.toString()));
    child.stderr?.on("data", (d) => (stderr += d.toString()));
    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });

    if (stdin != null) child.stdin?.write(stdin);
    child.stdin?.end();
  });
}

/**
 * 从模型原始输出中提取 HTML 文档。
 * - 优先剥离 ```html ... ``` 代码围栏
 * - 截取 <!DOCTYPE / <html> … </html>
 * - 退而求其次：含标签则按片段返回；否则 ok=false（前端兜底显示原文 + 警告）
 */
export function extractHtml(raw: string): { html: string; ok: boolean } {
  let t = (raw || "").trim();
  const fence = t.match(/```(?:html)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  const lower = t.toLowerCase();
  const doctype = lower.indexOf("<!doctype");
  const htmlOpen = lower.indexOf("<html");
  const start = doctype >= 0 ? doctype : htmlOpen;
  const endIdx = lower.lastIndexOf("</html>");
  if (start >= 0 && endIdx > start) {
    return { html: t.slice(start, endIdx + "</html>".length), ok: true };
  }
  if (/<[a-z!][\s\S]*>/i.test(t)) return { html: t, ok: true }; // 片段
  return { html: t, ok: false };
}

/**
 * 从模型原始输出中提取一个 JSON 对象（text→线框图用：期望拿到布局规格）。
 * - 优先剥离 ```json ... ``` 代码围栏
 * - 否则截取第一个 `{` 到最后一个 `}`
 * 解析失败时 ok=false（调用方兜底报错）。
 */
export function extractJson<T = unknown>(raw: string): { json: T | null; ok: boolean } {
  let t = (raw || "").trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const s = t.indexOf("{");
    const e = t.lastIndexOf("}");
    if (s >= 0 && e > s) t = t.slice(s, e + 1);
  }
  try {
    return { json: JSON.parse(t) as T, ok: true };
  } catch {
    return { json: null, ok: false };
  }
}
