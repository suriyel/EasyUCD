// Claude Code 适配器。
// 实际调用：claude -p --output-format json --tools "" --append-system-prompt <SKILL> （用户输入经 stdin）
//   - 没有设计文档臆测的 --skill / --no-stream
//   - --output-format json 的 stdout 是结构化对象，含 result / usage / total_cost_usd
//   - --tools "" 禁用所有工具，确保只做文本生成
//   - 用户输入走 stdin，不进 argv（防注入，§7.2）

import {
  CliAdapter,
  GenerateRaw,
  findExecutable,
  spawnCapture,
  cleanChildEnv,
  NotInstalledError,
  NotAuthedError,
  TimeoutError,
  CliError,
} from "./base.ts";

// 可选隔离：当宿主 ~/.claude/settings.json 注入了会干扰自定义端点的配置时，
// 设 WTH_CLAUDE_ISOLATE=1 让 claude 只加载 project 级设置（跳过用户设置）。
// 默认关闭，普通用户不受影响。
const ISOLATE = process.env.WTH_CLAUDE_ISOLATE === "1";

export class ClaudeCodeAdapter implements CliAdapter {
  name = "claude";

  async available(): Promise<boolean> {
    const exe = findExecutable("claude");
    if (!exe) return false;
    try {
      const r = await spawnCapture(exe.command, ["--version"], {
        timeoutMs: 10_000,
        shell: exe.isBatch,
      });
      return r.code === 0;
    } catch {
      return false;
    }
  }

  async generate(input: string, skill: string): Promise<GenerateRaw> {
    const exe = findExecutable("claude");
    if (!exe) throw new NotInstalledError("claude CLI 未安装");

    const args = ["-p", "--output-format", "json", "--tools", "", "--append-system-prompt", skill];
    if (ISOLATE) args.push("--setting-sources", "project", "--settings", "{}");

    let r;
    try {
      r = await spawnCapture(exe.command, args, {
        timeoutMs: 120_000,
        stdin: input,
        shell: exe.isBatch,
        env: cleanChildEnv(),
      });
    } catch (e: any) {
      if (e?.code === "ENOENT") throw new NotInstalledError("claude CLI 未安装");
      throw new CliError(String(e?.message ?? e));
    }

    if (r.timedOut) throw new TimeoutError("claude 生成超时（>120s）");
    if (r.code !== 0) {
      const blob = `${r.stderr}\n${r.stdout}`;
      if (/log ?in|auth|unauthor|credential|api key/i.test(blob)) {
        throw new NotAuthedError(r.stderr.trim() || "claude 未登录");
      }
      throw new CliError(r.stderr.trim() || `claude 退出码 ${r.code}`);
    }

    // 解析 JSON 输出
    let text = r.stdout.trim();
    let tokensUsed: number | undefined;
    let costUsd: number | undefined;
    try {
      const obj = JSON.parse(r.stdout);
      if (obj?.is_error) {
        throw new CliError(typeof obj.result === "string" ? obj.result : "claude 返回错误");
      }
      if (typeof obj?.result === "string") text = obj.result;
      if (obj?.usage) {
        tokensUsed = (obj.usage.input_tokens ?? 0) + (obj.usage.output_tokens ?? 0);
      }
      if (typeof obj?.total_cost_usd === "number") costUsd = obj.total_cost_usd;
    } catch (e) {
      if (e instanceof CliError) throw e;
      // 非 JSON（理论上不该发生）：按原始 stdout 文本处理
    }

    return { text, tokensUsed, costUsd };
  }
}
