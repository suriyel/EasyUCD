// 首次启动初始化 + 配置/SKILL 读写。设计文档 §4.5 / §7.1。

import { mkdir, writeFile, cp, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import {
  configDir,
  configFile,
  skillsDir,
  logsDir,
  bundledSkillsDir,
  bundledSkillFile,
  skillFile,
  skillName,
} from "./paths.ts";

export type CliName = "claude" | "opencode";
export type AppConfig = { defaultCli: CliName; skillName: string };

const DEFAULT_CONFIG: AppConfig = { defaultCli: "claude", skillName };

/** 确保用户配置目录存在；首次启动复制内置 SKILL、写默认 config.json。 */
export async function ensureInit(): Promise<void> {
  await mkdir(configDir, { recursive: true });
  await mkdir(logsDir, { recursive: true });

  if (!existsSync(skillFile) && existsSync(bundledSkillsDir)) {
    await mkdir(skillsDir, { recursive: true });
    await cp(bundledSkillsDir, skillsDir, { recursive: true });
  }
  if (!existsSync(configFile)) {
    await writeFile(configFile, JSON.stringify(DEFAULT_CONFIG, null, 2), "utf8");
  }
}

export async function readConfig(): Promise<AppConfig> {
  try {
    const raw = await readFile(configFile, "utf8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export async function writeConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  const next = { ...(await readConfig()), ...patch };
  await mkdir(configDir, { recursive: true });
  await writeFile(configFile, JSON.stringify(next, null, 2), "utf8");
  return next;
}

/** 读取 SKILL 内容：优先用户可编辑副本，缺失时回退内置模板。 */
export async function readSkill(): Promise<string> {
  try {
    return await readFile(skillFile, "utf8");
  } catch {
    return await readFile(bundledSkillFile, "utf8");
  }
}
