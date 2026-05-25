// OpenCode 适配器（最佳努力；设计文档将其列为第二版能力）。
// 实际调用：opencode run --file <临时文件> "<固定指令>"
//   - opencode run 没有 --print；非交互式即 opencode run [message]
//   - 把 SKILL + 用户输入写入临时文件，用 --file 附带，argv 中只有我方生成的路径与固定指令
//     → 即使 Windows 下 .cmd 需 shell:true 也无注入面（§7.2）
//   - 默认格式输出，stdout 交给上层 extractHtml 提取 HTML（对版本变化更鲁棒）

import { writeFile, unlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import {
  CliAdapter,
  GenerateRaw,
  findExecutable,
  spawnCapture,
  NotInstalledError,
  TimeoutError,
  CliError,
} from "./base.ts";

const INSTRUCTION =
  "请阅读所附文件中的 SKILL 指令与用户输入，严格按 SKILL 要求只输出一个完整的 HTML 文档，不要任何解释或代码围栏。";

export class OpenCodeAdapter implements CliAdapter {
  name = "opencode";

  async available(): Promise<boolean> {
    const exe = findExecutable("opencode");
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
    const exe = findExecutable("opencode");
    if (!exe) throw new NotInstalledError("opencode CLI 未安装");

    const promptFile = join(tmpdir(), `wth-prompt-${randomUUID()}.md`);
    await writeFile(promptFile, `${skill}\n\n---\n\n用户输入：\n${input}`, "utf8");

    try {
      const args = ["run", "--file", promptFile, INSTRUCTION];
      let r;
      try {
        r = await spawnCapture(exe.command, args, {
          timeoutMs: 120_000,
          shell: exe.isBatch,
        });
      } catch (e: any) {
        if (e?.code === "ENOENT") throw new NotInstalledError("opencode CLI 未安装");
        throw new CliError(String(e?.message ?? e));
      }

      if (r.timedOut) throw new TimeoutError("opencode 生成超时（>120s）");
      if (r.code !== 0) throw new CliError(r.stderr.trim() || `opencode 退出码 ${r.code}`);

      return { text: r.stdout };
    } finally {
      unlink(promptFile).catch(() => {});
    }
  }
}
