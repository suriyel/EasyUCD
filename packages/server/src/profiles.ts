// 模型资源方案（profile）存储与派生逻辑。参考 TechDemos profiles.json / server.js:428-442。
// 与 config.json 解耦：config.json 决定默认用哪个工具（CliSelector），
// 本文件（models.json）决定各工具的「激活方案」及其凭证/模型。
//
// 设计要点：
//   - 双工具槽 claude / opencode，各含 active(id) 与 profiles[]。
//   - claude 方案分两种 kind：login（用已登录 claude，不注入 env）、proxy（自定义端点）。
//   - 默认激活 login → 默认生成行为与改造前完全一致（向后兼容）。

import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { configDir, modelsFile } from "./paths.ts";

export type ClaudeModels = {
  primary?: string;
  haiku?: string;
  sonnet?: string;
  opus?: string;
  reasoning?: string;
};

export type ClaudeProfile = {
  id: string;
  name: string;
  kind: "login" | "proxy";
  baseUrl?: string;
  authToken?: string;
  models?: ClaudeModels;
};

export type OpenCodeProfile = {
  id: string;
  name: string;
  model: string;
};

export type ToolName = "claude" | "opencode";

export type ModelStore = {
  claude: { active: string; profiles: ClaudeProfile[] };
  opencode: { active: string; profiles: OpenCodeProfile[] };
};

export const LOGIN_PROFILE_ID = "anthropic-login";

/** 种子默认值：claude 默认激活 login（不注入 env），另带一个空 token 的 MiniMax proxy 范例。 */
function seedStore(): ModelStore {
  const minimax: ClaudeProfile = {
    id: "minimax",
    name: "MiniMax（兼容端点）",
    kind: "proxy",
    baseUrl: process.env.ANTHROPIC_BASE_URL || "https://api.minimaxi.com/anthropic",
    authToken: process.env.ANTHROPIC_AUTH_TOKEN || "",
    models: {
      primary: process.env.ANTHROPIC_MODEL || "MiniMax-M2.7",
      haiku: "MiniMax-M2.7-highspeed",
      sonnet: "MiniMax-M2.7-highspeed",
      opus: "MiniMax-M2.7-highspeed",
      reasoning: "MiniMax-M2.7-highspeed",
    },
  };
  return {
    claude: {
      active: LOGIN_PROFILE_ID,
      profiles: [
        { id: LOGIN_PROFILE_ID, name: "Anthropic（已登录）", kind: "login" },
        minimax,
      ],
    },
    opencode: { active: "", profiles: [] },
  };
}

/** 补全缺失字段（auto-vivify），保证读到的对象结构完整。 */
function normalize(raw: unknown): ModelStore {
  const seed = seedStore();
  const data = (raw && typeof raw === "object" ? raw : {}) as Partial<ModelStore>;
  const claude = (data.claude ?? {}) as Partial<ModelStore["claude"]>;
  const opencode = (data.opencode ?? {}) as Partial<ModelStore["opencode"]>;
  const store: ModelStore = {
    claude: {
      active: typeof claude.active === "string" ? claude.active : "",
      profiles: Array.isArray(claude.profiles) ? claude.profiles : [],
    },
    opencode: {
      active: typeof opencode.active === "string" ? opencode.active : "",
      profiles: Array.isArray(opencode.profiles) ? opencode.profiles : [],
    },
  };
  // 始终保证存在内置 login 方案（不可删除项）
  if (!store.claude.profiles.some((p) => p.id === LOGIN_PROFILE_ID)) {
    store.claude.profiles.unshift(seed.claude.profiles[0]);
  }
  if (!store.claude.active) store.claude.active = LOGIN_PROFILE_ID;
  return store;
}

/** 首次启动写入种子文件（在 ensureInit 末尾调用）。 */
export async function ensureModelsInit(): Promise<void> {
  if (!existsSync(modelsFile)) {
    await mkdir(configDir, { recursive: true });
    await writeFile(modelsFile, JSON.stringify(seedStore(), null, 2), "utf8");
  }
}

export async function readModels(): Promise<ModelStore> {
  try {
    const raw = await readFile(modelsFile, "utf8");
    return normalize(JSON.parse(raw));
  } catch {
    return seedStore();
  }
}

export async function writeModels(store: ModelStore): Promise<ModelStore> {
  const next = normalize(store);
  await mkdir(configDir, { recursive: true });
  await writeFile(modelsFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** 新增或更新一个方案（按 id 覆盖）。 */
export async function upsertProfile(
  tool: ToolName,
  id: string,
  body: ClaudeProfile | OpenCodeProfile,
): Promise<ModelStore> {
  const store = await readModels();
  const slot = store[tool];
  const profile = { ...body, id } as ClaudeProfile & OpenCodeProfile;
  const idx = slot.profiles.findIndex((p) => p.id === id);
  if (idx >= 0) slot.profiles[idx] = profile as never;
  else slot.profiles.push(profile as never);
  return writeModels(store);
}

/** 删除方案；禁止删内置 login 与当前 active。 */
export async function deleteProfile(tool: ToolName, id: string): Promise<ModelStore> {
  const store = await readModels();
  const slot = store[tool];
  if (tool === "claude" && id === LOGIN_PROFILE_ID) {
    throw new Error("内置「已登录」方案不可删除");
  }
  if (slot.active === id) {
    throw new Error("当前激活方案不可删除，请先激活其他方案");
  }
  slot.profiles = slot.profiles.filter((p) => p.id !== id) as never;
  return writeModels(store);
}

/** 设置激活方案。 */
export async function setActive(tool: ToolName, id: string): Promise<ModelStore> {
  const store = await readModels();
  const slot = store[tool];
  if (!slot.profiles.some((p) => p.id === id)) {
    throw new Error(`方案不存在：${id}`);
  }
  slot.active = id;
  return writeModels(store);
}

export async function getActiveProfile(tool: "claude"): Promise<ClaudeProfile | null>;
export async function getActiveProfile(tool: "opencode"): Promise<OpenCodeProfile | null>;
export async function getActiveProfile(
  tool: ToolName,
): Promise<ClaudeProfile | OpenCodeProfile | null> {
  const store = await readModels();
  const slot = store[tool];
  return slot.profiles.find((p) => p.id === slot.active) ?? null;
}

/**
 * 把 claude proxy 方案映射为子进程环境变量（复刻 TechDemos server.js:428-442）。
 * 仅 proxy 且仅非空值才写入；login 或无值返回 {}。
 */
export function buildClaudeProfileEnv(profile: ClaudeProfile | null): Record<string, string> {
  if (!profile || profile.kind !== "proxy") return {};
  const env: Record<string, string> = {};
  if (profile.baseUrl) env.ANTHROPIC_BASE_URL = profile.baseUrl;
  if (profile.authToken) env.ANTHROPIC_AUTH_TOKEN = profile.authToken;
  const m = profile.models ?? {};
  if (m.primary) env.ANTHROPIC_MODEL = m.primary;
  if (m.haiku) env.ANTHROPIC_DEFAULT_HAIKU_MODEL = m.haiku;
  if (m.sonnet) env.ANTHROPIC_DEFAULT_SONNET_MODEL = m.sonnet;
  if (m.opus) env.ANTHROPIC_DEFAULT_OPUS_MODEL = m.opus;
  if (m.reasoning) env.ANTHROPIC_REASONING_MODEL = m.reasoning;
  env.API_TIMEOUT_MS = "3000000";
  env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "1";
  return env;
}
