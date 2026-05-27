#!/usr/bin/env node
// 把「紧凑布局规格」物化为合法的 .excalidraw 场景文件。
//
// 设计同 scripts/gen-controls.mjs：LLM 负责创意布局（挑控件 + 定坐标 + 写文案），
// 本脚本负责样板字段（补全 Excalidraw 全部必填项、分组接线、文字摆放、customData.controlType）。
//
// 产物与 EasyUCD 控件兼容：每个控件 = 1 矩形 + （有文案时）1 文字，二者共享同一个
// groupIds，且都带 customData.controlType。这样 packages/web/src/lib/simplify.ts
// 能按 groupIds[0] 正确合并、识别控件类型，打通「文本 → 线框 → HTML」回环。
//
// 词汇表外的 type 退化为普通几何图形（rectangle/ellipse/diamond/line/arrow/text），
// 不带 controlType —— simplify.ts 会回退到几何类型，wireframe-to-html 视其为装饰/占位。
//
// 本脚本刻意零依赖（纯 Node ESM），字段全集照搬 gen-controls.mjs（已核实 Excalidraw 容错）。
//
// 用法：
//   node build-scene.mjs --in spec.json --out page.excalidraw
//   cat spec.json | node build-scene.mjs --out page.excalidraw
//
// spec 形如：{ "controls": [ { "type":"Page","x":0,"y":0,"w":400,"h":700,"text":"登录" }, ... ] }
//   也接受直接传数组 [ {...}, ... ]。每项字段：
//   - type 必填；x/y/w/h 缺省时按词汇表建议尺寸/原点补全
//   - text 可选（按钮文案/标签/标题/占位符）
//   - fontSize/align 可选（覆盖默认）
//   嵌套靠坐标包含关系推断（容器矩形需在坐标上包住子控件），与现有管线一致。

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

// —— 确定性随机数（mulberry32），与 gen-controls.mjs 一致，使产物稳定、利于 diff ——
let _seed = 0x9e3779b9;
function rand() {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const nonce = () => Math.floor(rand() * 2 ** 31);

const STROKE = "#1e1e1e";
const NOW = 1748000000000; // 固定时间戳，保持产物稳定

// 控件建议尺寸 / 字号，仅在 spec 缺省 w/h 时兜底。下方对象体由 control-catalog.mjs 经 gen:controls 生成（标记块内勿手改）。
const CONTROL_SPECS = {
  // <generated:control-specs>
  // 容器
  Page: { w: 400, h: 600 },
  Section: { w: 360, h: 200 },
  Card: { w: 240, h: 160 },
  Modal: { w: 320, h: 240 },
  Drawer: { w: 280, h: 600 },
  Collapse: { w: 320, h: 120 },
  Splitter: { w: 360, h: 200 },
  // 导航
  Header: { w: 400, h: 60 },
  Footer: { w: 400, h: 60 },
  Nav: { w: 400, h: 44 },
  Tabs: { w: 320, h: 40 },
  Breadcrumb: { w: 300, h: 24 },
  Menu: { w: 200, h: 240 },
  Sidebar: { w: 220, h: 600 },
  Toolbar: { w: 360, h: 44 },
  Pagination: { w: 240, h: 32 },
  Steps: { w: 360, h: 48 },
  Anchor: { w: 160, h: 120 },
  Dropdown: { w: 160, h: 40 },
  // 输入
  Input: { w: 240, h: 40 },
  Password: { w: 240, h: 40 },
  IPInput: { w: 240, h: 40 },
  Textarea: { w: 240, h: 100 },
  Select: { w: 240, h: 40 },
  Checkbox: { w: 160, h: 24 },
  Radio: { w: 160, h: 24 },
  Switch: { w: 56, h: 28 },
  // 表单进阶
  Slider: { w: 240, h: 24 },
  NumberInput: { w: 120, h: 40 },
  DatePicker: { w: 200, h: 40 },
  TimePicker: { w: 160, h: 40 },
  DateRange: { w: 280, h: 40 },
  DateTimeRange: { w: 400, h: 40 },
  Upload: { w: 240, h: 176 },
  Rate: { w: 160, h: 28 },
  ColorPicker: { w: 160, h: 40 },
  SearchBox: { w: 240, h: 40 },
  Cascader: { w: 240, h: 40 },
  AutoComplete: { w: 240, h: 40 },
  TagInput: { w: 240, h: 40 },
  Form: { w: 360, h: 320 },
  FormItem: { w: 320, h: 56 },
  // 选择进阶
  TreeSelect: { w: 240, h: 40 },
  TreeTable: { w: 320, h: 180 },
  MultiSelect: { w: 240, h: 40 },
  CheckboxGroup: { w: 240, h: 96 },
  RadioGroup: { w: 240, h: 96 },
  Transfer: { w: 320, h: 180 },
  Segmented: { w: 240, h: 36 },
  Mentions: { w: 240, h: 80 },
  CheckableTag: { w: 72, h: 26 },
  // 展示
  Heading: { w: 240, h: 36, fontSize: 24 },
  Text: { w: 240, h: 24 },
  Image: { w: 200, h: 140 },
  Icon: { w: 32, h: 32, fontSize: 20 },
  Avatar: { w: 48, h: 48, fontSize: 20 },
  Badge: { w: 44, h: 22, fontSize: 12 },
  Tag: { w: 72, h: 26 },
  Divider: { w: 320, h: 16 },
  // 反馈与状态
  Alert: { w: 320, h: 48 },
  Toast: { w: 280, h: 64 },
  Tooltip: { w: 120, h: 32 },
  Popover: { w: 200, h: 120 },
  Popconfirm: { w: 220, h: 100 },
  Progress: { w: 240, h: 12 },
  ProgressCircle: { w: 64, h: 64, fontSize: 14 },
  Spinner: { w: 40, h: 40 },
  Skeleton: { w: 240, h: 80 },
  Empty: { w: 200, h: 140 },
  Result: { w: 240, h: 160 },
  // 数据展示
  List: { w: 240, h: 160 },
  Table: { w: 320, h: 160 },
  PagedTable: { w: 320, h: 208 },
  Grid: { w: 320, h: 200 },
  Tree: { w: 240, h: 180 },
  CheckTree: { w: 240, h: 180 },
  Timeline: { w: 240, h: 200 },
  Statistic: { w: 160, h: 80 },
  Descriptions: { w: 320, h: 160 },
  Calendar: { w: 280, h: 240 },
  Carousel: { w: 320, h: 180 },
  BarChart: { w: 240, h: 160 },
  LineChart: { w: 240, h: 160 },
  PieChart: { w: 160, h: 160 },
  // 动作
  Button: { w: 120, h: 40 },
  Link: { w: 100, h: 24 },
  ButtonGroup: { w: 240, h: 40 },
  FAB: { w: 56, h: 56, fontSize: 28 },
  // 媒体
  Video: { w: 320, h: 180 },
  Audio: { w: 280, h: 40 },
  Map: { w: 320, h: 200 },
  // </generated:control-specs>
};

// 词汇表外允许的几何类型（小写匹配）。
const GEOMETRIC_TYPES = new Set([
  "rectangle",
  "ellipse",
  "diamond",
  "line",
  "arrow",
  "text",
  "freedraw",
]);

function baseProps(groupId, controlType) {
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

function makeRect({ id, groupId, controlType, type = "rectangle", x, y, w, h }) {
  return {
    id,
    type,
    x,
    y,
    width: w,
    height: h,
    ...baseProps(groupId, controlType),
  };
}

function makeText({ id, groupId, controlType, x, y, w, h, text, fontSize, align }) {
  return {
    id,
    type: "text",
    x,
    y,
    width: w,
    height: h,
    ...baseProps(groupId, controlType),
    text,
    originalText: text,
    fontSize,
    fontFamily: 1,
    textAlign: align,
    verticalAlign: "top",
    containerId: null,
    lineHeight: 1.25,
  };
}

function makeLinear({ id, groupId, type, x, y, w, h }) {
  // 用 w/h 作为端点位移，默认水平方向。
  const dx = w || 100;
  const dy = type === "line" && h ? h : 0;
  return {
    id,
    type, // "line" | "arrow"
    x,
    y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    ...baseProps(groupId, null),
    points: [
      [0, 0],
      [dx, dy],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: type === "arrow" ? "arrow" : null,
  };
}

// 文字摆放：容器类（h>60）靠左上、左对齐；原子控件居中。复用 gen-controls.mjs 规则。
function placeText({ x, y, w, h, label, fontSize, alignOverride }) {
  const textH = Math.round(fontSize * 1.25);
  const textW = Math.max(8, Math.round(label.length * fontSize * 0.62));
  const isContainer = h > 60;
  if (isContainer) {
    return { tx: x + 8, ty: y + 8, tw: textW, th: textH, align: alignOverride || "left" };
  }
  return {
    tx: x + Math.round((w - textW) / 2),
    ty: y + Math.round((h - textH) / 2),
    tw: textW,
    th: textH,
    align: alignOverride || "center",
  };
}

function buildElements(controls) {
  const elements = [];
  let controlCount = 0;
  const warnings = [];

  controls.forEach((c, i) => {
    const rawType = String(c.type || "").trim();
    if (!rawType) {
      warnings.push(`#${i}: 缺少 type，已跳过`);
      return;
    }
    const lower = rawType.toLowerCase();
    const isControl = Object.prototype.hasOwnProperty.call(CONTROL_SPECS, rawType);
    const spec = isControl ? CONTROL_SPECS[rawType] : null;

    const x = Number.isFinite(c.x) ? c.x : 0;
    const y = Number.isFinite(c.y) ? c.y : 0;
    const w = Number.isFinite(c.w) ? c.w : spec?.w ?? 120;
    const h = Number.isFinite(c.h) ? c.h : spec?.h ?? 40;
    const fontSize = Number.isFinite(c.fontSize) ? c.fontSize : spec?.fontSize ?? 16;
    const text = typeof c.text === "string" && c.text.trim() !== "" ? c.text : null;

    const slug = lower.replace(/[^a-z0-9]+/g, "");
    const groupId = `grp-${i}-${slug}`;

    if (isControl) {
      // 控件：矩形 + （可选）文字，同 group，带 controlType。
      elements.push(
        makeRect({ id: `${slug}-${i}-rect`, groupId, controlType: rawType, x, y, w, h }),
      );
      if (text) {
        const p = placeText({ x, y, w, h, label: text, fontSize, alignOverride: c.align });
        elements.push(
          makeText({
            id: `${slug}-${i}-text`,
            groupId,
            controlType: rawType,
            x: p.tx,
            y: p.ty,
            w: p.tw,
            h: p.th,
            text,
            fontSize,
            align: p.align,
          }),
        );
      }
      controlCount += 1;
      return;
    }

    // 词汇表外 —— 几何/装饰元素，不带 controlType。
    if (!GEOMETRIC_TYPES.has(lower)) {
      warnings.push(`#${i}: 未知类型 "${rawType}"，按 rectangle 处理`);
    }

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

    // rectangle / ellipse / diamond / freedraw / 未知 → 矩形族图形
    const geoType = ["ellipse", "diamond"].includes(lower) ? lower : "rectangle";
    elements.push(
      makeRect({ id: `${slug}-${i}`, groupId, controlType: null, type: geoType, x, y, w, h }),
    );
    if (text) {
      const p = placeText({ x, y, w, h, label: text, fontSize, alignOverride: c.align });
      elements.push(
        makeText({
          id: `${slug}-${i}-text`,
          groupId,
          controlType: null,
          x: p.tx,
          y: p.ty,
          w: p.tw,
          h: p.th,
          text,
          fontSize,
          align: p.align,
        }),
      );
    }
    controlCount += 1;
  });

  return { elements, controlCount, warnings };
}

// —— CLI 参数解析 ——
function parseArgs(argv) {
  const args = { in: null, out: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--in") args.in = argv[++i];
    else if (a === "--out") args.out = argv[++i];
    else if (a === "-h" || a === "--help") args.help = true;
  }
  return args;
}

const USAGE = `用法：
  node build-scene.mjs --in spec.json --out page.excalidraw
  cat spec.json | node build-scene.mjs --out page.excalidraw

spec：{ "controls": [ { "type", "x", "y", "w", "h", "text?", "fontSize?", "align?" }, ... ] }
      （也接受直接传 controls 数组）`;

function readSpec(inPath) {
  if (inPath) return readFileSync(inPath, "utf8");
  // 从 stdin 读取
  return readFileSync(0, "utf8");
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(USAGE);
    process.exit(0);
  }
  if (!args.out) {
    console.error("✗ 缺少 --out <文件路径>\n\n" + USAGE);
    process.exit(1);
  }

  let raw;
  try {
    raw = readSpec(args.in);
  } catch (e) {
    console.error(`✗ 读取规格失败：${e.message}\n\n` + USAGE);
    process.exit(1);
  }

  let spec;
  try {
    spec = JSON.parse(raw);
  } catch (e) {
    console.error(`✗ 规格不是合法 JSON：${e.message}`);
    process.exit(1);
  }

  const controls = Array.isArray(spec) ? spec : spec.controls;
  if (!Array.isArray(controls) || controls.length === 0) {
    console.error('✗ 规格里没有 controls 数组（应为 { "controls": [...] } 或直接传数组）');
    process.exit(1);
  }

  const { elements, controlCount, warnings } = buildElements(controls);

  const scene = {
    type: "excalidraw",
    version: 2,
    source: "text-to-excalidraw",
    elements,
    appState: { gridSize: null, viewBackgroundColor: "#ffffff" },
    files: {},
  };

  const json = JSON.stringify(scene, null, 2);
  mkdirSync(dirname(args.out), { recursive: true });
  writeFileSync(args.out, json, "utf8");

  for (const w of warnings) console.warn(`⚠ ${w}`);
  console.log(`✓ 生成 ${controlCount} 个控件 / ${elements.length} 个元素 → ${args.out}`);
}

main();
