// 集中管理路径：用户配置目录、内置资源、前端构建产物。
// 用户目录用 os.homedir()/.config，跨平台（Windows 下为 C:\Users\<u>\.config\...）。

import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
// 本文件位于 packages/server/src，仓库根 = ../../..
export const repoRoot = join(here, "..", "..", "..");

export const skillName = "wireframe-to-html";

export const configDir = join(homedir(), ".config", "wireframe-to-html");
export const configFile = join(configDir, "config.json");
export const skillsDir = join(configDir, "skills");
export const logsDir = join(configDir, "logs");
export const skillDir = join(skillsDir, skillName);
export const skillFile = join(skillDir, "SKILL.md");

export const bundledSkillsDir = join(repoRoot, "assets", "skills");
export const bundledSkillFile = join(bundledSkillsDir, skillName, "SKILL.md");

export const webDist = join(repoRoot, "packages", "web", "dist");
