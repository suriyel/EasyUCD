// 把「紧凑布局规格」（controls 数组）物化为合法的 Excalidraw 场景元素。
//
// 与 .claude/skills/text-to-excalidraw/scripts/build-scene.mjs 同源同逻辑：
//   - 那个 .mjs 供 Claude Code CLI skill 独立调用（产出 .excalidraw 文件）；
//   - 本模块供服务端 /api/generate-wireframe 复用（产出 elements 注入画板）。
// 两份刻意各自自包含（skill 须可独立运行），改一处时请同步另一处。
//
// 产物与 EasyUCD 控件兼容：每个控件 = 1 矩形 + （有文案时）1 文字，二者共享同一 groupIds，
// 且都带 customData.controlType —— packages/web/src/lib/simplify.ts 据此识别控件、转 HTML。
// 词汇表（27 种）外的 type 退化为普通几何图形，不带 controlType。

export type ControlSpec = {
  type: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  fontSize?: number;
  align?: "left" | "center" | "right";
};

export type ExcalidrawScene = {
  type: "excalidraw";
  version: 2;
  source: string;
  elements: unknown[];
  appState: { gridSize: null; viewBackgroundColor: string };
  files: Record<string, unknown>;
};

export type BuildResult = { scene: ExcalidrawScene; controlCount: number; warnings: string[] };

// —— 确定性随机数（mulberry32），与 gen-controls.mjs 一致，使产物稳定 ——
function makeRng(seed = 0x9e3779b9) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STROKE = "#1e1e1e";
const NOW = 1748000000000;

// 27 种控件的建议尺寸/字号（取自 gen-controls.mjs 的 SPECS），仅在 spec 缺省 w/h 时兜底。
const CONTROL_SPECS: Record<string, { w: number; h: number; fontSize?: number }> = {
  Page: { w: 400, h: 600 },
  Section: { w: 360, h: 200 },
  Card: { w: 240, h: 160 },
  Modal: { w: 320, h: 240 },
  Header: { w: 400, h: 60 },
  Footer: { w: 400, h: 60 },
  Nav: { w: 400, h: 44 },
  Tabs: { w: 320, h: 40 },
  Breadcrumb: { w: 300, h: 24 },
  Input: { w: 240, h: 40 },
  Password: { w: 240, h: 40 },
  Textarea: { w: 240, h: 100 },
  Select: { w: 240, h: 40 },
  Checkbox: { w: 160, h: 24 },
  Radio: { w: 160, h: 24 },
  Switch: { w: 80, h: 28 },
  Heading: { w: 240, h: 36, fontSize: 24 },
  Text: { w: 240, h: 24 },
  Image: { w: 200, h: 140 },
  Icon: { w: 32, h: 32, fontSize: 20 },
  Avatar: { w: 48, h: 48, fontSize: 20 },
  Badge: { w: 64, h: 24, fontSize: 12 },
  Button: { w: 120, h: 40 },
  Link: { w: 100, h: 24 },
  List: { w: 240, h: 160 },
  Table: { w: 320, h: 160 },
  Grid: { w: 320, h: 200 },
};

const GEOMETRIC_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "freedraw",
]);

export function buildScene(controls: ControlSpec[], source = "text-to-wireframe"): BuildResult {
  const rng = makeRng();
  const nonce = () => Math.floor(rng() * 2 ** 31);

  function baseProps(groupId: string, controlType: string | null) {
    return {
      angle: 0,
      strokeColor: STROKE,
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 1,
      opacity: 100,
      groupIds: [groupId],
      frameId: null,
      index: null,
      roundness: null,
      seed: nonce(),
      version: 1,
      versionNonce: nonce(),
      isDeleted: false,
      boundElements: null,
      updated: NOW,
      link: null,
      locked: false,
      customData: controlType ? { controlType } : null,
    };
  }

  const makeRect = (a: {
    id: string;
    groupId: string;
    controlType: string | null;
    type?: string;
    x: number;
    y: number;
    w: number;
    h: number;
  }) => ({
    id: a.id,
    type: a.type ?? "rectangle",
    x: a.x,
    y: a.y,
    width: a.w,
    height: a.h,
    ...baseProps(a.groupId, a.controlType),
  });

  const makeText = (a: {
    id: string;
    groupId: string;
    controlType: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    fontSize: number;
    align: string;
  }) => ({
    id: a.id,
    type: "text",
    x: a.x,
    y: a.y,
    width: a.w,
    height: a.h,
    ...baseProps(a.groupId, a.controlType),
    text: a.text,
    originalText: a.text,
    fontSize: a.fontSize,
    fontFamily: 1,
    textAlign: a.align,
    verticalAlign: "top",
    containerId: null,
    lineHeight: 1.25,
  });

  const makeLinear = (a: { id: string; groupId: string; type: string; x: number; y: number; w: number; h: number }) => {
    const dx = a.w || 100;
    const dy = a.type === "line" && a.h ? a.h : 0;
    return {
      id: a.id,
      type: a.type,
      x: a.x,
      y: a.y,
      width: Math.abs(dx),
      height: Math.abs(dy),
      ...baseProps(a.groupId, null),
      points: [
        [0, 0],
        [dx, dy],
      ],
      lastCommittedPoint: null,
      startBinding: null,
      endBinding: null,
      startArrowhead: null,
      endArrowhead: a.type === "arrow" ? "arrow" : null,
    };
  };

  // 文字摆放：容器（h>60）靠左上、左对齐；原子控件居中。复用 gen-controls.mjs 规则。
  function placeText(x: number, y: number, w: number, h: number, label: string, fontSize: number, alignOverride?: string) {
    const textH = Math.round(fontSize * 1.25);
    const textW = Math.max(8, Math.round(label.length * fontSize * 0.62));
    if (h > 60) return { tx: x + 8, ty: y + 8, tw: textW, th: textH, align: alignOverride || "left" };
    return {
      tx: x + Math.round((w - textW) / 2),
      ty: y + Math.round((h - textH) / 2),
      tw: textW,
      th: textH,
      align: alignOverride || "center",
    };
  }

  const elements: unknown[] = [];
  const warnings: string[] = [];
  let controlCount = 0;

  controls.forEach((c, i) => {
    const rawType = String(c?.type ?? "").trim();
    if (!rawType) {
      warnings.push(`#${i}: 缺少 type，已跳过`);
      return;
    }
    const lower = rawType.toLowerCase();
    const isControl = Object.prototype.hasOwnProperty.call(CONTROL_SPECS, rawType);
    const spec = isControl ? CONTROL_SPECS[rawType] : null;

    const x = Number.isFinite(c.x) ? (c.x as number) : 0;
    const y = Number.isFinite(c.y) ? (c.y as number) : 0;
    const w = Number.isFinite(c.w) ? (c.w as number) : spec?.w ?? 120;
    const h = Number.isFinite(c.h) ? (c.h as number) : spec?.h ?? 40;
    const fontSize = Number.isFinite(c.fontSize) ? (c.fontSize as number) : spec?.fontSize ?? 16;
    const text = typeof c.text === "string" && c.text.trim() !== "" ? c.text : null;

    const slug = lower.replace(/[^a-z0-9]+/g, "");
    const groupId = `grp-${i}-${slug}`;

    if (isControl) {
      elements.push(makeRect({ id: `${slug}-${i}-rect`, groupId, controlType: rawType, x, y, w, h }));
      if (text) {
        const p = placeText(x, y, w, h, text, fontSize, c.align);
        elements.push(
          makeText({ id: `${slug}-${i}-text`, groupId, controlType: rawType, x: p.tx, y: p.ty, w: p.tw, h: p.th, text, fontSize, align: p.align }),
        );
      }
      controlCount += 1;
      return;
    }

    if (!GEOMETRIC_TYPES.has(lower)) warnings.push(`#${i}: 未知类型 "${rawType}"，按 rectangle 处理`);

    if (lower === "text") {
      const label = text ?? "Text";
      elements.push(
        makeText({
          id: `${slug}-${i}-text`,
          groupId,
          controlType: null,
          x,
          y,
          w: Math.max(8, w),
          h: Math.max(Math.round(fontSize * 1.25), h),
          text: label,
          fontSize,
          align: c.align || "left",
        }),
      );
      controlCount += 1;
      return;
    }

    if (lower === "line" || lower === "arrow") {
      elements.push(makeLinear({ id: `${slug}-${i}`, groupId, type: lower, x, y, w, h }));
      controlCount += 1;
      return;
    }

    const geoType = lower === "ellipse" || lower === "diamond" ? lower : "rectangle";
    elements.push(makeRect({ id: `${slug}-${i}`, groupId, controlType: null, type: geoType, x, y, w, h }));
    if (text) {
      const p = placeText(x, y, w, h, text, fontSize, c.align);
      elements.push(
        makeText({ id: `${slug}-${i}-text`, groupId, controlType: null, x: p.tx, y: p.ty, w: p.tw, h: p.th, text, fontSize, align: p.align }),
      );
    }
    controlCount += 1;
  });

  const scene: ExcalidrawScene = {
    type: "excalidraw",
    version: 2,
    source,
    elements,
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {},
  };

  return { scene, controlCount, warnings };
}
