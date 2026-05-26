// Mock 适配器：不调用任何 CLI，根据简化 JSON 拼出占位 HTML。
// 用于无配额消耗的全链路联调（环境变量 WTH_MOCK=1 时启用）。

import { CliAdapter, GenerateRaw, GenerateOptions } from "./base.ts";

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

type El = { id: string; type: string; x: number; y: number; w: number; h: number; text?: string; parent?: string };

function renderEl(e: El): string {
  const label = e.text ? escapeHtml(e.text) : escapeHtml(e.type);
  const meta = `${escapeHtml(e.type)} · ${e.w}×${e.h} @(${e.x},${e.y})${e.parent ? " · ⊂" + escapeHtml(e.parent) : ""}`;
  return `<div class="el" data-type="${escapeHtml(e.type)}"><strong>${label}</strong><small>${meta}</small></div>`;
}

/**
 * Mock：根据文字描述拼一个占位线框布局规格（不调用模型）。
 * 用于 /api/generate-wireframe 的无配额全链路联调。把每一行非空文本当成一个表单项，
 * 整体放进一个 Page 容器里，演示「文本→画板」链路是通的。
 */
export function mockWireframeControls(text: string): { controls: unknown[] } {
  const lines = String(text)
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
  const pad = 24;
  const innerW = 400 - pad * 2;
  const controls: unknown[] = [];
  let y = pad;

  controls.push({ type: "Heading", x: pad, y, w: innerW, h: 36, text: lines[0] || "Mock 线框" });
  y += 56;
  for (const line of lines.slice(1)) {
    controls.push({ type: "Input", x: pad, y, w: innerW, h: 40, text: line });
    y += 56;
  }
  controls.push({ type: "Button", x: pad, y, w: innerW, h: 44, text: "提交" });
  y += 60;

  const page = { type: "Page", x: 0, y: 0, w: 400, h: Math.max(y + pad, 200), text: "Mock 页面" };
  return { controls: [page, ...controls] };
}

export class MockAdapter implements CliAdapter {
  name = "mock";

  async available(): Promise<boolean> {
    return true;
  }

  async generate(input: string, _skill?: string, _opts?: GenerateOptions): Promise<GenerateRaw> {
    let parsed: { elements?: El[]; notes?: string } = {};
    try {
      parsed = JSON.parse(input);
    } catch {
      /* 非法输入：返回空文档 */
    }
    const els = Array.isArray(parsed.elements) ? parsed.elements : [];
    const notes = parsed.notes ?? "";
    const body = els.map(renderEl).join("\n      ");

    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>Mock 预览</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 16px; }
    .banner { background:#fff4e6; border:1px solid #ffd8a8; padding:8px 12px; border-radius:4px; color:#d9480f; }
    .el { border:1px solid #ccc; border-radius:4px; padding:8px 10px; margin:6px 0; display:flex; justify-content:space-between; align-items:baseline; gap:12px; }
    .el small { color:#888; font-size:11px; }
  </style>
</head>
<body>
  <p class="banner">[MOCK 输出] 未调用任何模型，仅根据 ${els.length} 个画板元素拼出占位结构${
    notes ? "；备注：" + escapeHtml(notes) : ""
  }。</p>
      ${body}
</body>
</html>`;

    return { text: html, tokensUsed: 0 };
  }
}
