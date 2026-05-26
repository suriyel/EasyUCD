// CLI 适配层公共部分：接口、错误类型、可执行文件解析、安全 spawn、HTML 提取。
// 设计文档 §4.4.3 / §7.2。

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, delimiter, dirname } from "node:path";

// 生成调用的子进程超时（毫秒）。精美风格输出明显更慢，默认 600s（10 分钟）；
// 可用环境变量 WTH_GEN_TIMEOUT_MS 覆盖（非正数/非法值回退默认）。
export const GEN_TIMEOUT_MS = (() => {
  const n = Number(process.env.WTH_GEN_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 600_000;
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

export type ResolvedExe = {
  /** 启动用的命令（.exe 用全路径；npm .cmd 解析后指向 node.exe 或底层 .exe） */
  command: string;
  /** 需要前置的参数（node 脚本 shim 时为 [入口 .js]，其余为 []） */
  prefixArgs: string[];
  /** 是否需要经 shell（cmd.exe）启动；仅在 .cmd shim 解析失败时才为 true */
  shell: boolean;
} | null;

/**
 * 解析 Windows npm `.cmd` shim，取出底层可执行文件以绕开 cmd.exe。
 * 移植自 TechDemos（server.js parseNpmCmdShim）。
 *
 * 背景：`cmd.exe /d /s /c <shim.cmd> ...`（即 spawn shell:true）会把多行 argv 在
 * 第一个 \n 处截断/按空白拆词，且不为各参数加引号。我们传给 claude 的
 * `--append-system-prompt <SKILL>` 含 frontmatter 分隔符 `---`，于是 `---` 被拆成
 * 独立词元 → claude 报 `unknown option '---'`。直连底层 node/exe（shell:false）后，
 * Node 会按 CommandLineToArgvW 规则正确加引号，换行/`---` 原样送达子进程。
 *
 * 返回 { node, entry } | null：
 *   - node 脚本 shim（"node" "%~dp0\..\cli.js" %*）→ { node, entry }，spawn(node, [entry, ...argv])
 *   - 直连 exe shim（"%~dp0\..\foo.exe" %*，如 opencode-ai）→ { node: null, entry }，spawn(entry, argv)
 */
function parseNpmCmdShim(cmdPath: string): { node: string | null; entry: string } | null {
  let txt: string;
  try {
    txt = readFileSync(cmdPath, "utf8");
  } catch {
    return null;
  }
  const dp0 = dirname(cmdPath);
  // 1. node 脚本 shim：带引号的 prog（任意）+ 带引号的 "%~dp0\..." 入口 + %*（容忍 %~dp0 / %dp0% 变体）
  const nodeShim = txt.match(/"[^"\r\n]+"\s+"%(?:~?dp0|dp0%)%?\\([^"\r\n]+?)"\s*%\*/i);
  if (nodeShim) {
    const entry = join(dp0, nodeShim[1]);
    if (existsSync(entry)) {
      const colocated = join(dp0, "node.exe");
      // 优先 shim 同目录的 node.exe，否则用当前服务进程的 node（服务本就跑在 node 上）
      const node = existsSync(colocated) ? colocated : process.execPath;
      return { node, entry };
    }
  }
  // 2. 直连 exe shim：单个带引号的 "%~dp0\path\foo.exe" + %*（无 prog 前缀，shim 直接 exec 该 .exe）
  const exeShim = txt.match(/"%(?:~?dp0|dp0%)%?\\([^"\r\n]+?\.exe)"\s*%\*/i);
  if (exeShim) {
    const entry = join(dp0, exeShim[1]);
    if (existsSync(entry)) return { node: null, entry };
  }
  return null;
}

/**
 * 在 PATH 中解析可执行文件。
 * - 非 Windows / Windows .exe：返回全路径，shell:false 直接 spawn。
 * - Windows .cmd/.bat：先尝试 parseNpmCmdShim 直连底层 node/exe（shell:false，修多行 argv 截断）；
 *   解析不出来才回退裸名 + shell:true（由 cmd.exe 经 PATHEXT 解析）。
 */
export function findExecutable(name: string): ResolvedExe {
  const dirs = (process.env.PATH || "").split(delimiter).filter(Boolean);
  if (process.platform !== "win32") {
    for (const d of dirs) {
      const p = join(d, name);
      if (existsSync(p)) return { command: p, prefixArgs: [], shell: false };
    }
    return { command: name, prefixArgs: [], shell: false }; // 交给 spawn 解析
  }
  const exts = (process.env.PATHEXT || ".EXE;.CMD;.BAT").split(";").map((e) => e.toLowerCase());
  const preferred = [".exe", ".com"];
  const ordered = [...preferred, ...exts.filter((e) => !preferred.includes(e))];
  for (const dir of dirs) {
    for (const ext of ordered) {
      const p = join(dir, name + ext);
      if (existsSync(p)) {
        const isBatch = /\.(cmd|bat)$/i.test(ext);
        if (!isBatch) return { command: p, prefixArgs: [], shell: false }; // .exe/.com：全路径无 shell
        // .cmd/.bat：解析 npm shim，直连底层 node/exe 绕开 cmd.exe（根治多行 argv 被拆词的 `---` 报错）
        const shim = parseNpmCmdShim(p);
        if (shim && shim.node) return { command: shim.node, prefixArgs: [shim.entry], shell: false };
        if (shim) return { command: shim.entry, prefixArgs: [], shell: false };
        // 解析失败：回退裸名 + shell（cmd.exe 经 PATHEXT 解析）。注意此路径仍有多行 argv 限制。
        return { command: name, prefixArgs: [], shell: true };
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
