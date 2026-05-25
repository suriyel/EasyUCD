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
