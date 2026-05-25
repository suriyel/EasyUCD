// 适配器注册表 + 选择逻辑。WTH_MOCK=1 时强制使用 Mock 适配器（联调用）。

import { CliAdapter } from "./base.ts";
import { ClaudeCodeAdapter } from "./claude-code.ts";
import { OpenCodeAdapter } from "./opencode.ts";
import { MockAdapter } from "./mock.ts";

export const isMock = process.env.WTH_MOCK === "1" || process.env.WTH_MOCK === "true";

const claude = new ClaudeCodeAdapter();
const opencode = new OpenCodeAdapter();
const mock = new MockAdapter();

const registry: Record<string, CliAdapter> = { claude, opencode, mock };

/** 按前端传入的 cli 选择适配器；mock 模式下恒返回 mock。未知值回退 claude。 */
export function getAdapter(cli: string): CliAdapter {
  if (isMock) return mock;
  return registry[cli] ?? claude;
}

/** 真实（非 mock）适配器，供 /api/health 探测可用性。 */
export function realAdapters(): CliAdapter[] {
  return [claude, opencode];
}
