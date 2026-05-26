// 后端 API 封装。同源调用；开发时 Vite 把 /api 代理到 Fastify(3001)。
import type { SimplifiedElement } from "./lib/simplify";

export type CliStatus = { name: string; available: boolean };
export type Health = {
  ok: boolean;
  mock: boolean;
  defaultCli: string;
  clis: CliStatus[];
};

export type GenerateResponse = {
  html: string;
  elapsedMs: number;
  tokensUsed: number;
  warning?: string;
};

export type AppConfig = { defaultCli: string; skillName: string; skillPath: string };

export class ApiError extends Error {
  status: number;
  hint?: string;
  code?: string;
  constructor(message: string, status: number, code?: string, hint?: string) {
    super(message);
    this.status = status;
    this.code = code;
    this.hint = hint;
  }
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(
      (data as any).message || res.statusText,
      res.status,
      (data as any).error,
      (data as any).hint,
    );
  }
  return data as T;
}

export function getHealth(): Promise<Health> {
  return fetch("/api/health").then((r) => parse<Health>(r));
}

export function getConfig(): Promise<AppConfig> {
  return fetch("/api/config").then((r) => parse<AppConfig>(r));
}

export function setConfig(defaultCli: string): Promise<AppConfig> {
  return fetch("/api/config", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ defaultCli }),
  }).then((r) => parse<AppConfig>(r));
}

export function getSkills(): Promise<{ skills: string[]; dir: string }> {
  return fetch("/api/skills").then((r) => parse(r));
}

// ---------- 模型资源方案（model profiles） ----------

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

export type OpenCodeProfile = { id: string; name: string; model: string };

export type ToolName = "claude" | "opencode";

export type ModelStore = {
  claude: { active: string; profiles: ClaudeProfile[] };
  opencode: { active: string; profiles: OpenCodeProfile[] };
};

export const LOGIN_PROFILE_ID = "anthropic-login";

export function getModels(): Promise<ModelStore> {
  return fetch("/api/models").then((r) => parse<ModelStore>(r));
}

export function getOpencodeModels(): Promise<{ models: string[] }> {
  return fetch("/api/models/opencode/list").then((r) => parse<{ models: string[] }>(r));
}

export function saveProfile(
  tool: ToolName,
  id: string,
  body: ClaudeProfile | OpenCodeProfile,
): Promise<{ ok: boolean; store: ModelStore }> {
  return fetch(`/api/models/${tool}/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => parse(r));
}

export function deleteProfile(
  tool: ToolName,
  id: string,
): Promise<{ ok: boolean; store: ModelStore }> {
  return fetch(`/api/models/${tool}/${encodeURIComponent(id)}`, {
    method: "DELETE",
  }).then((r) => parse(r));
}

export function setActiveProfile(
  tool: ToolName,
  id: string,
): Promise<{ ok: boolean; store: ModelStore }> {
  return fetch(`/api/models/${tool}/active`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ id }),
  }).then((r) => parse(r));
}

export function generate(payload: {
  elements: SimplifiedElement[];
  notes: string;
  cli: string;
}): Promise<GenerateResponse> {
  return fetch("/api/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => parse<GenerateResponse>(r));
}

export type WireframeResponse = {
  /** 完整的 Excalidraw 元素数组，可直接 updateScene 注入画板 */
  elements: unknown[];
  count: number;
  elapsedMs: number;
  tokensUsed: number;
  warning?: string;
};

// 文本 → 线框图：把文字描述送后端，拿回可注入画板的 Excalidraw 元素。
export function generateWireframe(payload: {
  text: string;
  cli: string;
}): Promise<WireframeResponse> {
  return fetch("/api/generate-wireframe", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).then((r) => parse<WireframeResponse>(r));
}
