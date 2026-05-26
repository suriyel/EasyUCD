#!/usr/bin/env node
// 生成预设控件库 wireframe-controls.excalidrawlib（v2），并把派生数据同步回其它文件。
//
// 唯一数据源是 scripts/control-catalog.mjs（87 个控件）。本脚本：
//   1) 把每个控件的 parts（精绘构图）物化为多个 Excalidraw 图元，拼成库项；
//   2) 用「标记块」回填派生数据到 5 处（杜绝漂移）：两个 build-scene 的 CONTROL_SPECS、
//      三张 SKILL 表（text-to-wireframe / text-to-excalidraw 词汇表、wireframe-to-html 映射表）；
//   3) 生成人读全量表 docs/控件全量表.md。
//
// 每个控件 = 若干图元，全部：
//   - 共享同一个 groupIds（拖到画布后作为一个整体移动）
//   - 都带 customData.controlType（前端简化器据此识别控件类型，见 simplify.ts）
// interpretComposition 保证「外层 bounds 元素是首个矩形（纯椭圆控件则是 group[0]）、主标签是首个文字」，
// 从而满足 simplify.ts 的合并契约。
//
// 本脚本刻意不依赖 @excalidraw/excalidraw：直接产出完整元素字段。
// 用确定性 PRNG 生成 seed/versionNonce，使重复运行产物稳定（利于 git diff）。

import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONTROLS, CATEGORIES, compositionMap, specsMap } from "./control-catalog.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const repoFile = (...p) => join(repoRoot, ...p);

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
  return { id, type: "rectangle", x, y, width: w, height: h, ...baseProps(groupId, controlType) };
}

function makeEllipse({ id, groupId, controlType, x, y, w, h }) {
  return { id, type: "ellipse", x, y, width: w, height: h, ...baseProps(groupId, controlType) };
}

function makeLine({ id, groupId, controlType, x, y, dx, dy }) {
  return {
    id,
    type: "line",
    x,
    y,
    width: Math.abs(dx),
    height: Math.abs(dy),
    ...baseProps(groupId, controlType),
    points: [
      [0, 0],
      [dx, dy],
    ],
    lastCommittedPoint: null,
    startBinding: null,
    endBinding: null,
    startArrowhead: null,
    endArrowhead: null,
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

// 把 px 或 "NN%" 解析为绝对像素（百分比相对控件盒的某一维度 base）。
function px(v, base) {
  if (typeof v === "number") return Math.round(v);
  const m = /^(-?\d+(?:\.\d+)?)%$/.exec(String(v));
  return m ? Math.round((parseFloat(m[1]) / 100) * base) : 0;
}

// 把控件的 parts（构图）物化为 Excalidraw 元素数组（原点在 0,0 的库项坐标系）。
// 排序强制满足 simplify 契约：bounds 部件最前 → 其余非文字 → 文字（主标签在前）。
function interpretComposition(spec, groupId) {
  const ct = spec.type;
  const baseFont = spec.fontSize ?? 16;
  let parts = compositionMap[ct];

  // 缺省回退：全框矩形 + 标签（容器靠左上、原子居中）
  if (!parts || !parts.length) {
    const isContainer = spec.h > 60;
    parts = [
      { kind: "rect", bounds: true, x: 0, y: 0, w: "100%", h: "100%" },
      isContainer
        ? { kind: "text", x: 8, y: 8, text: spec.label, align: "left" }
        : { kind: "text", text: spec.label, center: true, align: "center" },
    ];
  }

  const boundsPart = parts.find((p) => p.bounds);
  const nonText = parts.filter((p) => p !== boundsPart && p.kind !== "text");
  const texts = parts.filter((p) => p !== boundsPart && p.kind === "text");
  const ordered = [...(boundsPart ? [boundsPart] : []), ...nonText, ...texts];

  const els = [];
  let n = 0;
  for (const p of ordered) {
    const reps = p.repeat?.count ?? 1;
    const sdx = p.repeat?.dx ?? 0;
    const sdy = p.repeat?.dy ?? 0;
    for (let r = 0; r < reps; r++) {
      const ox = px(sdx, spec.w) * r;
      const oy = px(sdy, spec.h) * r;
      const id = `${ct}-${p.kind}-${n++}`;
      if (p.kind === "text") {
        const fs = p.fontSize ?? baseFont;
        const text = p.text ?? spec.label ?? "";
        const textW = Math.max(8, Math.round(String(text).length * fs * 0.62));
        const textH = Math.round(fs * 1.25);
        let tx;
        let ty;
        if (p.center) {
          tx = Math.round((spec.w - textW) / 2);
          ty = p.y != null ? px(p.y, spec.h) : Math.round((spec.h - textH) / 2);
        } else {
          tx = px(p.x ?? 0, spec.w);
          ty = px(p.y ?? 0, spec.h);
        }
        els.push(makeText({ id, groupId, controlType: ct, x: tx + ox, y: ty + oy, w: textW, h: textH, text, fontSize: fs, align: p.align ?? (p.center ? "center" : "left") }));
      } else {
        const x = px(p.x ?? 0, spec.w) + ox;
        const y = px(p.y ?? 0, spec.h) + oy;
        const w = px(p.w ?? 0, spec.w);
        const h = px(p.h ?? 0, spec.h);
        if (p.kind === "rect") els.push(makeRect({ id, groupId, controlType: ct, x, y, w, h }));
        else if (p.kind === "ellipse") els.push(makeEllipse({ id, groupId, controlType: ct, x, y, w, h }));
        else if (p.kind === "line") els.push(makeLine({ id, groupId, controlType: ct, x, y, dx: w, dy: h }));
      }
    }
  }
  return els;
}

function buildItem(spec) {
  const groupId = `grp-${spec.type.toLowerCase()}`;
  return {
    id: `ctl-${spec.type.toLowerCase()}`,
    status: "published",
    name: spec.name,
    created: NOW,
    elements: interpretComposition(spec, groupId),
  };
}

// ——————————————————————— 1) 生成 .excalidrawlib ———————————————————————
const lib = {
  type: "excalidrawlib",
  version: 2,
  source: "wireframe-to-html",
  libraryItems: CONTROLS.map(buildItem),
};
const libJson = JSON.stringify(lib, null, 2);

const libTargets = [
  repoFile("assets", "wireframe-controls.excalidrawlib"),
  repoFile("packages", "web", "public", "wireframe-controls.excalidrawlib"),
];
for (const target of libTargets) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, libJson, "utf8");
  console.log(`✓ wrote ${lib.libraryItems.length} controls → ${target}`);
}

// ——————————————————————— 2) 标记块同步 ———————————————————————
// 只替换 begin/end 标记之间的内容；内容无变化则不写盘；缺标记则抛错（防静默漂移）。
function replaceRegion(file, begin, end, body, indent = "") {
  const src = readFileSync(file, "utf8");
  const b = src.indexOf(begin);
  const e = src.indexOf(end);
  if (b === -1 || e === -1) throw new Error(`标记缺失 ${file}（需要 ${begin} … ${end}）`);
  const next = `${src.slice(0, b + begin.length)}\n${body}\n${indent}${src.slice(e)}`;
  if (next !== src) {
    writeFileSync(file, next, "utf8");
    console.log(`✓ synced ${file}`);
  } else {
    console.log(`= unchanged ${file}`);
  }
}

// (a) CONTROL_SPECS 对象体（两个 build-scene 逐字节一致）
function specsBody() {
  const lines = [];
  let lastCat = null;
  for (const c of CONTROLS) {
    if (c.category !== lastCat) {
      lines.push(`  // ${c.category}`);
      lastCat = c.category;
    }
    const fs = c.fontSize ? `, fontSize: ${c.fontSize}` : "";
    lines.push(`  ${c.type}: { w: ${c.w}, h: ${c.h}${fs} },`);
  }
  return lines.join("\n");
}
const specs = specsBody();
for (const f of [
  repoFile("packages", "server", "src", "lib", "build-scene.ts"),
  repoFile(".claude", "skills", "text-to-excalidraw", "scripts", "build-scene.mjs"),
]) {
  replaceRegion(f, "// <generated:control-specs>", "// </generated:control-specs>", specs, "  ");
}

// (b) 词汇表（按分类，type + 建议 w×h）
function vocabBody() {
  const lines = ["| 分组 | type（建议 w×h） |", "|------|------|"];
  for (const cat of CATEGORIES) {
    const items = CONTROLS.filter((c) => c.category === cat).map((c) => `${c.type}(${c.w}×${c.h})`).join("、");
    if (items) lines.push(`| ${cat} | ${items} |`);
  }
  return lines.join("\n");
}
const vocab = vocabBody();
for (const f of [
  repoFile("assets", "skills", "text-to-wireframe", "SKILL.md"),
  repoFile(".claude", "skills", "text-to-excalidraw", "SKILL.md"),
]) {
  replaceRegion(f, "<!-- generated:controls -->", "<!-- /generated:controls -->", vocab, "");
}

// (c) 控件 → HTML 映射表
function htmlBody() {
  const lines = ["| type | HTML |", "|------|------|"];
  for (const c of CONTROLS) lines.push(`| ${c.type} | ${c.htmlMapping} |`);
  return lines.join("\n");
}
replaceRegion(
  repoFile("assets", "skills", "wireframe-to-html", "SKILL.md"),
  "<!-- generated:controls -->",
  "<!-- /generated:controls -->",
  htmlBody(),
  "",
);

// ——————————————————————— 3) 人读全量表 ———————————————————————
function docsContent() {
  const out = [
    "# EasyUCD 控件全量表",
    "",
    `> 由 \`scripts/gen-controls.mjs\` 从 \`scripts/control-catalog.mjs\` 自动生成，请勿手改。共 ${CONTROLS.length} 个控件。`,
    "",
  ];
  for (const cat of CATEGORIES) {
    const items = CONTROLS.filter((c) => c.category === cat);
    if (!items.length) continue;
    out.push(`## ${cat}（${items.length}）`, "", "| type | 默认 w×h | 设计要素 | HTML 映射 |", "|------|---------|---------|-----------|");
    for (const c of items) out.push(`| ${c.type} | ${c.w}×${c.h} | ${c.desc} | ${c.htmlMapping} |`);
    out.push("");
  }
  return out.join("\n");
}
const docsPath = repoFile("docs", "控件全量表.md");
mkdirSync(dirname(docsPath), { recursive: true });
writeFileSync(docsPath, docsContent(), "utf8");
console.log(`✓ wrote docs → ${docsPath}`);
