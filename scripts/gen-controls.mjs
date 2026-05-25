#!/usr/bin/env node
// 生成预设控件库 wireframe-controls.excalidrawlib（v2）。
//
// 每个控件 = 1 个矩形 + 1 段文字，二者：
//   - 共享同一个 groupIds（拖到画布后作为一个整体移动）
//   - 都带 customData.controlType（前端简化器据此识别控件类型，见 simplify.ts）
//
// 本脚本刻意不依赖 @excalidraw/excalidraw：直接产出完整元素字段。
// 即便个别字段缺省，Excalidraw 的 updateLibrary/restore 也会补全（已核实容错）。
//
// 用确定性 PRNG 生成 seed/versionNonce，使重复运行产物稳定（利于 git diff）。

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// —— 确定性随机数（mulberry32）——
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
    customData: { controlType },
  };
}

function makeRect({ id, groupId, controlType, x, y, w, h }) {
  return {
    id,
    type: "rectangle",
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

// 控件清单（设计文档 §4.2.1），按用途分组，共 27 个
const SPECS = [
  // 容器类
  { name: "Page", type: "Page", w: 400, h: 600, label: "Page" },
  { name: "Section", type: "Section", w: 360, h: 200, label: "Section" },
  { name: "Card", type: "Card", w: 240, h: 160, label: "Card" },
  { name: "Modal", type: "Modal", w: 320, h: 240, label: "Modal" },
  // 导航类
  { name: "Header", type: "Header", w: 400, h: 60, label: "Header" },
  { name: "Footer", type: "Footer", w: 400, h: 60, label: "Footer" },
  { name: "Nav", type: "Nav", w: 400, h: 44, label: "Nav" },
  { name: "Tabs", type: "Tabs", w: 320, h: 40, label: "Tab 1 | Tab 2 | Tab 3" },
  { name: "Breadcrumb", type: "Breadcrumb", w: 300, h: 24, label: "Home / Page" },
  // 输入类
  { name: "Input", type: "Input", w: 240, h: 40, label: "Input" },
  { name: "Password", type: "Password", w: 240, h: 40, label: "Password" },
  { name: "Textarea", type: "Textarea", w: 240, h: 100, label: "Textarea" },
  { name: "Select", type: "Select", w: 240, h: 40, label: "Select  ▾" },
  { name: "Checkbox", type: "Checkbox", w: 160, h: 24, label: "☐ Checkbox" },
  { name: "Radio", type: "Radio", w: 160, h: 24, label: "○ Radio" },
  { name: "Switch", type: "Switch", w: 80, h: 28, label: "Switch" },
  // 展示类
  { name: "Heading", type: "Heading", w: 240, h: 36, label: "Heading", fontSize: 24 },
  { name: "Text", type: "Text", w: 240, h: 24, label: "Text" },
  { name: "Image", type: "Image", w: 200, h: 140, label: "Image" },
  { name: "Icon", type: "Icon", w: 32, h: 32, label: "★", fontSize: 20 },
  { name: "Avatar", type: "Avatar", w: 48, h: 48, label: "A", fontSize: 20 },
  { name: "Badge", type: "Badge", w: 64, h: 24, label: "Badge", fontSize: 12 },
  // 动作类
  { name: "Button", type: "Button", w: 120, h: 40, label: "Button" },
  { name: "Link", type: "Link", w: 100, h: 24, label: "Link" },
  // 集合类
  { name: "List", type: "List", w: 240, h: 160, label: "List" },
  { name: "Table", type: "Table", w: 320, h: 160, label: "Table" },
  { name: "Grid", type: "Grid", w: 320, h: 200, label: "Grid" },
];

function buildItem(spec) {
  const groupId = `grp-${spec.type.toLowerCase()}`;
  const fontSize = spec.fontSize ?? 16;
  const textH = Math.round(fontSize * 1.25);
  // 估算文字宽度（仅用于摆放，非精确）
  const textW = Math.max(8, Math.round(spec.label.length * fontSize * 0.62));

  // 容器类（较高）标签靠左上；原子控件文字居中
  const isContainer = spec.h > 60;
  let tx;
  let ty;
  let align;
  if (isContainer) {
    tx = spec.x ?? 8;
    ty = 8;
    align = "left";
  } else {
    tx = Math.round((spec.w - textW) / 2);
    ty = Math.round((spec.h - textH) / 2);
    align = "center";
  }

  const rect = makeRect({
    id: `${spec.type}-rect`,
    groupId,
    controlType: spec.type,
    x: 0,
    y: 0,
    w: spec.w,
    h: spec.h,
  });
  const text = makeText({
    id: `${spec.type}-text`,
    groupId,
    controlType: spec.type,
    x: tx,
    y: ty,
    w: textW,
    h: textH,
    text: spec.label,
    fontSize,
    align,
  });

  return {
    id: `ctl-${spec.type.toLowerCase()}`,
    status: "published",
    name: spec.name,
    created: NOW,
    elements: [rect, text],
  };
}

const lib = {
  type: "excalidrawlib",
  version: 2,
  source: "wireframe-to-html",
  libraryItems: SPECS.map(buildItem),
};

const json = JSON.stringify(lib, null, 2);

const targets = [
  join(repoRoot, "assets", "wireframe-controls.excalidrawlib"),
  join(repoRoot, "packages", "web", "public", "wireframe-controls.excalidrawlib"),
];

for (const target of targets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, json, "utf8");
  console.log(`✓ wrote ${lib.libraryItems.length} controls → ${target}`);
}
