// 控件全量清单 —— 唯一数据源（single source of truth）。零依赖 ESM。
//
// 这里是 EasyUCD 所有预置控件的唯一定义处。scripts/gen-controls.mjs 从本文件：
//   1) 生成预设控件库 wireframe-controls.excalidrawlib（精绘：每控件由多个图元拼成）；
//   2) 用「标记块」把派生数据回填到其它 5 处（杜绝漂移）：
//      - packages/server/src/lib/build-scene.ts 的 CONTROL_SPECS
//      - .claude/skills/text-to-excalidraw/scripts/build-scene.mjs 的 CONTROL_SPECS
//      - assets/skills/text-to-wireframe/SKILL.md 词汇表
//      - .claude/skills/text-to-excalidraw/SKILL.md 词汇表
//      - assets/skills/wireframe-to-html/SKILL.md 控件→HTML 映射表
//   3) 生成人读全量表 docs/控件全量表.md。
//
// 关键约束（来自 packages/web/src/lib/simplify.ts，决定一切构图）：
// 每个控件按 groupIds[0] 合并为一个逻辑控件——
//   类型   = 首个带 customData.controlType 的元素；
//   文字   = 首个非空 text 元素；
//   边界框 = 首个 type==="rectangle"，否则 group[0]。
// 因此每个控件必须保证：外层边界元素是「首个矩形」（纯椭圆控件则是 group[0]），主标签文字排在所有文字之前。
// gen-controls.mjs 的 interpretComposition 会按 bounds 标记 + 排序强制满足该约束，作者无需关心元素书写顺序，
// 只需：① 给外层加 box()/eBox()（bounds:true）；② 把主标签作为「第一个」text 部件。

// —— 精绘 DSL：part 部件构造器（返回纯数据对象） ——
// 坐标支持数字(px) 或 "NN%"(占控件盒宽/高百分比)；line 用 (dx,dy) 表示走向（dy=0 即水平线）。
const box = (e = {}) => ({ kind: "rect", bounds: true, x: 0, y: 0, w: "100%", h: "100%", ...e }); // 全框边界矩形
const eBox = (e = {}) => ({ kind: "ellipse", bounds: true, x: 0, y: 0, w: "100%", h: "100%", ...e }); // 全框边界椭圆
const rect = (x, y, w, h, e = {}) => ({ kind: "rect", x, y, w, h, ...e });
const ell = (x, y, w, h, e = {}) => ({ kind: "ellipse", x, y, w, h, ...e });
const line = (x, y, dx, dy, e = {}) => ({ kind: "line", x, y, w: dx, h: dy, ...e });
const txt = (x, y, text, e = {}) => ({ kind: "text", x, y, text, ...e }); // 默认左对齐
const ctxt = (text, e = {}) => ({ kind: "text", text, center: true, ...e }); // 盒内居中
const rep = (count, dx, dy) => ({ repeat: { count, dx: dx || 0, dy: dy || 0 } }); // 重复：网格行/分页格/星级等

/**
 * @typedef {Object} ControlEntry
 * @property {string} name      palette 展示名 + 库项名
 * @property {string} type      controlType 词汇（PascalCase，simplify 的 key）
 * @property {string} category  分组（palette 顺序 + SKILL 表分组），须为 CATEGORIES 之一
 * @property {number} w
 * @property {number} h
 * @property {string} label     主文案（缺省 parts 时回退用）
 * @property {number} [fontSize]
 * @property {string} htmlMapping  写入 wireframe-to-html SKILL 的 HTML 列
 * @property {string} desc      一行设计要素（写入人读全量表）
 * @property {Array}  [parts]   精绘构图；缺省回退为 [全框矩形, 居中/左上文字]
 */

export const CATEGORIES = [
  "容器",
  "导航",
  "输入",
  "表单进阶",
  "选择进阶",
  "展示",
  "反馈与状态",
  "数据展示",
  "动作",
  "媒体",
];

/** @type {ControlEntry[]} 顺序即 Library 面板顺序，按 CATEGORIES 分组排布 */
export const CONTROLS = [
  // ========================= 容器 =========================
  {
    name: "Page", type: "Page", category: "容器", w: 400, h: 600, label: "Page",
    htmlMapping: "`<body>` 顶层主区 或 `<main>`", desc: "整页容器：全框 + 左上标题",
    parts: [box(), txt(8, 8, "Page", { align: "left" })],
  },
  {
    name: "Section", type: "Section", category: "容器", w: 360, h: 200, label: "Section",
    htmlMapping: "`<section>`", desc: "区块容器：全框 + 左上标题",
    parts: [box(), txt(8, 8, "Section", { align: "left" })],
  },
  {
    name: "Card", type: "Card", category: "容器", w: 240, h: 160, label: "Card",
    htmlMapping: "`<div class=\"card\">`", desc: "卡片：顶部图片条 + 标题 + 正文行",
    parts: [box(), rect(8, 8, 224, 72), txt(12, 90, "Card", { align: "left" }), line(12, 120, 216, 0), line(12, 136, 160, 0)],
  },
  {
    name: "Modal", type: "Modal", category: "容器", w: 320, h: 240, label: "Modal",
    htmlMapping: "`<dialog open>` 或 `<div role=\"dialog\">`", desc: "模态框：标题栏 + 关闭 × + 底部按钮",
    parts: [box(), line(0, 40, 320, 0), txt(12, 11, "Modal", { align: "left" }), txt(298, 11, "×"), rect(204, 190, 104, 36), txt(238, 199, "OK", { align: "left" })],
  },
  {
    name: "Drawer", type: "Drawer", category: "容器", w: 280, h: 600, label: "Drawer",
    htmlMapping: "`<aside>` 或侧向 `<dialog>`", desc: "侧边抽屉：标题栏 + 关闭 × + 内容行",
    parts: [box(), line(0, 48, 280, 0), txt(12, 15, "Drawer", { align: "left" }), txt(258, 15, "×"), line(16, 88, 248, 0), line(16, 128, 248, 0), line(16, 168, 248, 0)],
  },
  {
    name: "Collapse", type: "Collapse", category: "容器", w: 320, h: 120, label: "Collapse",
    htmlMapping: "`<details><summary>…</summary></details>`", desc: "折叠面板：多条标题行 + 右侧 ▸ 角标",
    parts: [box(), line(0, 40, 320, 0, rep(2, 0, 40)), txt(12, 11, "Panel 1", { align: "left" }), txt(12, 51, "Panel 2", { align: "left" }), txt(12, 91, "Panel 3", { align: "left" }), txt(298, 11, "▸"), txt(298, 51, "▸"), txt(298, 91, "▸")],
  },
  {
    name: "Splitter", type: "Splitter", category: "容器", w: 360, h: 200, label: "Splitter",
    htmlMapping: "`display:flex` + 拖拽分隔条", desc: "分栏：中部竖直分隔线 + 手柄",
    parts: [box(), line(180, 0, 0, 200), rect(174, 90, 12, 20), txt(60, 92, "Left", { align: "left" }), txt(244, 92, "Right", { align: "left" })],
  },

  // ========================= 导航 =========================
  {
    name: "Header", type: "Header", category: "导航", w: 400, h: 60, label: "Header",
    htmlMapping: "`<header>`", desc: "页头：左 logo + 右侧导航文字",
    parts: [box(), rect(16, 18, 24, 24), txt(52, 20, "Logo", { align: "left" }), txt(280, 20, "Home", { align: "left" }), txt(340, 20, "About", { align: "left" })],
  },
  {
    name: "Footer", type: "Footer", category: "导航", w: 400, h: 60, label: "Footer",
    htmlMapping: "`<footer>`", desc: "页脚：居中版权/分栏文字",
    parts: [box(), ctxt("© 2026 Footer")],
  },
  {
    name: "Nav", type: "Nav", category: "导航", w: 400, h: 44, label: "Nav",
    htmlMapping: "`<nav>`", desc: "导航条：一排导航项",
    parts: [box(), txt(16, 13, "Home", { align: "left" }), txt(96, 13, "Products", { align: "left" }), txt(196, 13, "About", { align: "left" }), txt(276, 13, "Contact", { align: "left" })],
  },
  {
    name: "Tabs", type: "Tabs", category: "导航", w: 320, h: 40, label: "Tab 1 | Tab 2 | Tab 3",
    htmlMapping: "`<div role=\"tablist\">` + 若干 `<button role=\"tab\">`", desc: "标签页：底部基线 + 首个下划线高亮",
    parts: [box(), line(0, 39, 320, 0), line(16, 37, 64, 0), txt(24, 10, "Tab 1", { align: "left" }), txt(128, 10, "Tab 2", { align: "left" }), txt(232, 10, "Tab 3", { align: "left" })],
  },
  {
    name: "Breadcrumb", type: "Breadcrumb", category: "导航", w: 300, h: 24, label: "Home / Page",
    htmlMapping: "`<nav aria-label=\"breadcrumb\"><ol><li>…`", desc: "面包屑：纯文字路径（无边框）",
    parts: [txt(0, 2, "Home / Products / Detail", { align: "left" })],
  },
  {
    name: "Menu", type: "Menu", category: "导航", w: 200, h: 240, label: "Menu",
    htmlMapping: "`<nav>` + `<ul>` 菜单", desc: "菜单：多条「icon + 文字」 + 分隔线",
    parts: [box(), rect(12, 14, 16, 16, rep(4, 0, 48)), txt(38, 14, "Menu item 1", { align: "left" }), txt(38, 62, "Menu item 2", { align: "left" }), txt(38, 110, "Menu item 3", { align: "left" }), txt(38, 158, "Menu item 4", { align: "left" }), line(0, 48, 200, 0, rep(3, 0, 48))],
  },
  {
    name: "Sidebar", type: "Sidebar", category: "导航", w: 220, h: 600, label: "Sidebar",
    htmlMapping: "`<aside>` 侧栏导航", desc: "侧栏：顶部 logo + 多条菜单项",
    parts: [box(), rect(16, 20, 28, 28), txt(52, 26, "Brand", { align: "left" }), rect(16, 80, 16, 16, rep(5, 0, 44)), txt(40, 80, "Nav 1", { align: "left" }), txt(40, 124, "Nav 2", { align: "left" }), txt(40, 168, "Nav 3", { align: "left" }), txt(40, 212, "Nav 4", { align: "left" }), txt(40, 256, "Nav 5", { align: "left" })],
  },
  {
    name: "Toolbar", type: "Toolbar", category: "导航", w: 360, h: 44, label: "Toolbar",
    htmlMapping: "`<div role=\"toolbar\">`", desc: "工具栏：一排小按钮 + 竖分隔",
    parts: [box(), rect(8, 8, 28, 28, rep(4, 36, 0)), line(160, 6, 0, 32), rect(176, 8, 28, 28, rep(3, 36, 0))],
  },
  {
    name: "Pagination", type: "Pagination", category: "导航", w: 240, h: 32, label: "1",
    htmlMapping: "`<nav aria-label=\"pagination\"><ul><li>…`", desc: "分页：一排小方格（首格高亮）",
    parts: [box(), rect(4, 4, 24, 24, rep(7, 30, 0)), txt(12, 7, "1", { align: "left" })],
  },
  {
    name: "Steps", type: "Steps", category: "导航", w: 360, h: 48, label: "Steps",
    htmlMapping: "`<ol>` 步骤列表", desc: "步骤条：圆点 + 连接线 + 步骤文字",
    parts: [box(), line(36, 16, 252, 0), ell(28, 8, 16, 16, rep(4, 84, 0)), txt(20, 30, "Step 1", { align: "left" }), txt(104, 30, "Step 2", { align: "left" }), txt(188, 30, "Step 3", { align: "left" }), txt(272, 30, "Step 4", { align: "left" })],
  },
  {
    name: "Anchor", type: "Anchor", category: "导航", w: 160, h: 120, label: "Anchor",
    htmlMapping: "`<nav>` 锚点目录", desc: "锚点：左竖线 + 锚点圆点 + 文字",
    parts: [box(), line(12, 8, 0, 104), ell(8, 14, 8, 8, rep(3, 0, 36)), txt(28, 12, "Section 1", { align: "left" }), txt(28, 48, "Section 2", { align: "left" }), txt(28, 84, "Section 3", { align: "left" })],
  },
  {
    name: "Dropdown", type: "Dropdown", category: "导航", w: 160, h: 40, label: "Dropdown",
    htmlMapping: "`<details>` / menu button", desc: "下拉菜单触发：文字 + 右 ▾",
    parts: [box(), txt(12, 11, "Dropdown", { align: "left" }), txt(136, 11, "▾")],
  },

  // ========================= 输入 =========================
  {
    name: "Input", type: "Input", category: "输入", w: 240, h: 40, label: "Input",
    htmlMapping: "`<input type=\"text\">`（text 作 placeholder 或前置 `<label>`）", desc: "文本框：全框 + 左侧占位文字",
    parts: [box(), txt(12, 11, "Input", { align: "left" })],
  },
  {
    name: "Password", type: "Password", category: "输入", w: 240, h: 40, label: "Password",
    htmlMapping: "`<input type=\"password\">`", desc: "密码框：占位文字 + 右侧眼睛",
    parts: [box(), txt(12, 11, "Password", { align: "left" }), ell(212, 14, 16, 12), ell(217, 16, 6, 8)],
  },
  {
    name: "Textarea", type: "Textarea", category: "输入", w: 240, h: 100, label: "Textarea",
    htmlMapping: "`<textarea>`", desc: "多行框：左上占位 + 右下缩放纹",
    parts: [box(), txt(12, 10, "Textarea", { align: "left" }), line(220, 92, 14, -14), line(228, 92, 6, -6)],
  },
  {
    name: "Select", type: "Select", category: "输入", w: 240, h: 40, label: "Select",
    htmlMapping: "`<select>` + `<option>`", desc: "下拉选择：文字 + 右 ▾",
    parts: [box(), txt(12, 11, "Select", { align: "left" }), txt(216, 11, "▾")],
  },
  {
    name: "Checkbox", type: "Checkbox", category: "输入", w: 160, h: 24, label: "Checkbox",
    htmlMapping: "`<label><input type=\"checkbox\">…</label>`", desc: "复选：勾选方块 + 文字",
    parts: [box(), rect(2, 4, 16, 16), line(5, 12, 4, 4), line(9, 16, 6, -8), txt(26, 3, "Checkbox", { align: "left" })],
  },
  {
    name: "Radio", type: "Radio", category: "输入", w: 160, h: 24, label: "Radio",
    htmlMapping: "`<label><input type=\"radio\">…</label>`", desc: "单选：圆 + 内圆点 + 文字",
    parts: [box(), ell(2, 4, 16, 16), ell(6, 8, 8, 8), txt(26, 3, "Radio", { align: "left" })],
  },
  {
    name: "Switch", type: "Switch", category: "输入", w: 56, h: 28, label: "Switch",
    htmlMapping: "`<label><input type=\"checkbox\" role=\"switch\">…</label>`", desc: "开关：胶囊轨道 + 右侧圆钮",
    parts: [box(), ell(30, 2, 24, 24)],
  },

  // ========================= 表单进阶 =========================
  {
    name: "Slider", type: "Slider", category: "表单进阶", w: 240, h: 24, label: "Slider",
    htmlMapping: "`<input type=\"range\">`", desc: "滑块：水平轨道线 + 中部圆钮",
    parts: [box(), line(6, 12, 228, 0), ell(108, 5, 14, 14)],
  },
  {
    name: "NumberInput", type: "NumberInput", category: "表单进阶", w: 120, h: 40, label: "0",
    htmlMapping: "`<input type=\"number\">`", desc: "数字步进：数字 + 右上下 ▲▼",
    parts: [box(), txt(12, 11, "0", { align: "left" }), line(92, 0, 0, 40), txt(99, 2, "▲", { align: "left", fontSize: 10 }), txt(99, 22, "▼", { align: "left", fontSize: 10 })],
  },
  {
    name: "DatePicker", type: "DatePicker", category: "表单进阶", w: 200, h: 40, label: "YYYY-MM-DD",
    htmlMapping: "`<input type=\"date\">`", desc: "日期选择：日期占位 + 右日历图标",
    parts: [box(), txt(12, 11, "YYYY-MM-DD", { align: "left" }), rect(170, 10, 20, 20), line(170, 16, 20, 0)],
  },
  {
    name: "TimePicker", type: "TimePicker", category: "表单进阶", w: 160, h: 40, label: "HH:MM",
    htmlMapping: "`<input type=\"time\">`", desc: "时间选择：时间占位 + 右时钟图标",
    parts: [box(), txt(12, 11, "HH:MM", { align: "left" }), ell(132, 10, 20, 20), line(142, 20, 0, -6)],
  },
  {
    name: "DateRange", type: "DateRange", category: "表单进阶", w: 280, h: 40, label: "Start ~ End",
    htmlMapping: "两个 `<input type=\"date\">`", desc: "日期范围：起止占位 + 右日历图标",
    parts: [box(), txt(12, 11, "Start   ~   End", { align: "left" }), rect(250, 10, 20, 20)],
  },
  {
    name: "Upload", type: "Upload", category: "表单进阶", w: 240, h: 120, label: "Upload",
    htmlMapping: "`<input type=\"file\">`（拖拽上传区）", desc: "上传区：虚线感框 + ↑ + 提示文字",
    parts: [box(), line(120, 36, 0, 28), line(110, 48, 10, -12), line(130, 48, -10, -12), ctxt("Click or drag to upload", { fontSize: 13, y: 72 })],
  },
  {
    name: "Rate", type: "Rate", category: "表单进阶", w: 160, h: 28, label: "★★★☆☆",
    htmlMapping: "星级 `role=\"radiogroup\"`（若干 `<input type=\"radio\">`）", desc: "评分：5 颗星（前 3 实心）",
    parts: [box(), txt(8, 4, "★", { align: "left", fontSize: 18, ...rep(5, 30, 0) })],
  },
  {
    name: "ColorPicker", type: "ColorPicker", category: "表单进阶", w: 160, h: 40, label: "#1E1E1E",
    htmlMapping: "`<input type=\"color\">`", desc: "取色：左色块 + 色值文字",
    parts: [box(), rect(8, 8, 24, 24), txt(42, 11, "#1E1E1E", { align: "left" })],
  },
  {
    name: "SearchBox", type: "SearchBox", category: "表单进阶", w: 240, h: 40, label: "Search",
    htmlMapping: "`<input type=\"search\">`", desc: "搜索框：左放大镜 + 占位文字",
    parts: [box(), ell(12, 11, 14, 14), line(24, 23, 8, 8), txt(38, 11, "Search", { align: "left" })],
  },
  {
    name: "Cascader", type: "Cascader", category: "表单进阶", w: 240, h: 40, label: "省 / 市 / 区",
    htmlMapping: "级联 `<select>`（多级联动）", desc: "级联选择：多级路径 + 右 ▾",
    parts: [box(), txt(12, 11, "省 / 市 / 区", { align: "left" }), txt(216, 11, "▾")],
  },
  {
    name: "AutoComplete", type: "AutoComplete", category: "表单进阶", w: 240, h: 40, label: "Type to search",
    htmlMapping: "`<input list=\"...\">` + `<datalist>`", desc: "自动完成：输入 + 下拉候选条",
    parts: [box(), txt(12, 11, "Type to search", { align: "left" }), txt(216, 11, "▾")],
  },
  {
    name: "TagInput", type: "TagInput", category: "表单进阶", w: 240, h: 40, label: "tag1",
    htmlMapping: "标签 + `<input>`（可输入多标签）", desc: "标签输入：内含标签胶囊 + 光标",
    parts: [box(), rect(8, 9, 52, 22), rect(66, 9, 52, 22), line(126, 10, 0, 20), txt(16, 12, "tag1", { align: "left", fontSize: 12 }), txt(74, 12, "tag2", { align: "left", fontSize: 12 })],
  },
  {
    name: "Form", type: "Form", category: "表单进阶", w: 360, h: 320, label: "Form",
    htmlMapping: "`<form>`（包裹其内表单控件）", desc: "表单：标题 + 多组「标签+输入」 + 提交",
    parts: [box(), txt(16, 14, "Form Title", { align: "left", fontSize: 18 }), txt(16, 56, "Label", { align: "left", ...rep(3, 0, 64) }), rect(16, 76, 328, 36, rep(3, 0, 64)), rect(244, 272, 100, 36), txt(270, 281, "Submit", { align: "left", fontSize: 13 })],
  },
  {
    name: "FormItem", type: "FormItem", category: "表单进阶", w: 320, h: 56, label: "Label",
    htmlMapping: "`<div class=\"form-item\">` label + control", desc: "表单项：左标签 + 右输入框",
    parts: [box(), txt(8, 18, "Label", { align: "left" }), rect(96, 10, 216, 36)],
  },

  // ========================= 选择进阶 =========================
  {
    name: "TreeSelect", type: "TreeSelect", category: "选择进阶", w: 240, h: 40, label: "Selected",
    htmlMapping: "树形 combobox（`<select>` 衍生，可勾选树）", desc: "树选择：▸ + 已选文字 + 右 ▾",
    parts: [box(), txt(12, 11, "▸ Selected", { align: "left" }), txt(216, 11, "▾")],
  },
  {
    name: "TreeTable", type: "TreeTable", category: "选择进阶", w: 320, h: 180, label: "Name",
    htmlMapping: "`<table>` + 可展开行（树形表格）", desc: "树形表格：表头 + 行线 + 首列层级缩进 ▸",
    parts: [box(), line(0, 32, 320, 0), line(0, 80, 320, 0), line(0, 128, 320, 0), txt(8, 7, "Name", { align: "left" }), txt(20, 44, "▸ Parent", { align: "left" }), txt(44, 92, "▸ Child", { align: "left" }), txt(64, 140, "Leaf", { align: "left" })],
  },
  {
    name: "MultiSelect", type: "MultiSelect", category: "选择进阶", w: 240, h: 40, label: "Tags",
    htmlMapping: "`<select multiple>` / 带 tag 多选", desc: "多选下拉：内含标签胶囊 + 右 ▾",
    parts: [box(), rect(8, 9, 44, 22), rect(58, 9, 44, 22), txt(16, 12, "A", { align: "left", fontSize: 12 }), txt(66, 12, "B", { align: "left", fontSize: 12 }), txt(216, 11, "▾")],
  },
  {
    name: "CheckboxGroup", type: "CheckboxGroup", category: "选择进阶", w: 240, h: 96, label: "Option 1",
    htmlMapping: "一组 `<label><input type=\"checkbox\">`", desc: "复选组：多行「方块 + 文字」",
    parts: [box(), rect(8, 8, 16, 16, rep(3, 0, 28)), txt(32, 7, "Option 1", { align: "left" }), txt(32, 35, "Option 2", { align: "left" }), txt(32, 63, "Option 3", { align: "left" })],
  },
  {
    name: "RadioGroup", type: "RadioGroup", category: "选择进阶", w: 240, h: 96, label: "Option 1",
    htmlMapping: "一组 `<label><input type=\"radio\">`", desc: "单选组：多行「圆 + 内点 + 文字」",
    parts: [box(), ell(8, 8, 16, 16, rep(3, 0, 28)), ell(12, 12, 8, 8, rep(3, 0, 28)), txt(32, 7, "Option 1", { align: "left" }), txt(32, 35, "Option 2", { align: "left" }), txt(32, 63, "Option 3", { align: "left" })],
  },
  {
    name: "Transfer", type: "Transfer", category: "选择进阶", w: 320, h: 180, label: "Source",
    htmlMapping: "双 `<ul>` + 移动按钮（穿梭框）", desc: "穿梭框：左右双列表 + 中间 ‹ › 移动",
    parts: [box(), rect(8, 8, 128, 164), rect(184, 8, 128, 164), line(8, 36, 128, 0), line(184, 36, 128, 0), txt(16, 14, "Source", { align: "left" }), txt(192, 14, "Target", { align: "left" }), txt(150, 72, "›"), txt(150, 96, "‹")],
  },
  {
    name: "Segmented", type: "Segmented", category: "选择进阶", w: 240, h: 36, label: "Day",
    htmlMapping: "分段 `role=\"radiogroup\"`（segmented）", desc: "分段器：竖分隔分段（首段高亮）",
    parts: [box(), line(80, 0, 0, 36), line(160, 0, 0, 36), txt(28, 9, "Day", { align: "left" }), txt(100, 9, "Week", { align: "left" }), txt(176, 9, "Month", { align: "left" })],
  },
  {
    name: "Mentions", type: "Mentions", category: "选择进阶", w: 240, h: 80, label: "Hi @alice",
    htmlMapping: "`<textarea>` + @ 提及候选", desc: "提及输入：@name + 候选下拉条",
    parts: [box(), txt(12, 10, "Hi @alice", { align: "left" }), rect(12, 40, 160, 32), txt(20, 48, "@alice  @bob", { align: "left", fontSize: 12 })],
  },
  {
    name: "CheckableTag", type: "CheckableTag", category: "选择进阶", w: 72, h: 26, label: "Tag",
    htmlMapping: "可勾选 `<span class=\"tag\">`（`<label>` 包裹）", desc: "可选标签：圆角胶囊（选中态）",
    parts: [box(), ctxt("Tag", { fontSize: 13 })],
  },

  // ========================= 展示 =========================
  {
    name: "Heading", type: "Heading", category: "展示", w: 240, h: 36, label: "Heading", fontSize: 24,
    htmlMapping: "`<h1>`～`<h3>`（按层级/尺寸择一）", desc: "标题：大字号纯文字",
    parts: [txt(0, 0, "Heading", { align: "left", fontSize: 24 })],
  },
  {
    name: "Text", type: "Text", category: "展示", w: 240, h: 24, label: "Text",
    htmlMapping: "`<p>`", desc: "正文：纯文字",
    parts: [txt(0, 0, "Body text", { align: "left" })],
  },
  {
    name: "Image", type: "Image", category: "展示", w: 200, h: 140, label: "Image",
    htmlMapping: "`<img alt=\"…\">`（占位 `https://placehold.co/WxH`）", desc: "图片占位：全框 + 对角交叉线",
    parts: [box(), line(0, 0, 200, 140), line(0, 140, 200, -140)],
  },
  {
    name: "Icon", type: "Icon", category: "展示", w: 32, h: 32, label: "★", fontSize: 20,
    htmlMapping: "`<span aria-hidden=\"true\">`（图标占位）", desc: "图标：方框 + 居中符号",
    parts: [box(), ctxt("★", { fontSize: 20 })],
  },
  {
    name: "Avatar", type: "Avatar", category: "展示", w: 48, h: 48, label: "A", fontSize: 20,
    htmlMapping: "圆形 `<img alt=\"…\">` 或占位 `<div>`", desc: "头像：圆形 + 字母/人形",
    parts: [eBox(), ctxt("A", { fontSize: 20 })],
  },
  {
    name: "Badge", type: "Badge", category: "展示", w: 44, h: 22, label: "New", fontSize: 12,
    htmlMapping: "`<span class=\"badge\">`", desc: "徽标：小胶囊 + 数字/文字",
    parts: [box(), ctxt("New", { fontSize: 12 })],
  },
  {
    name: "Tag", type: "Tag", category: "展示", w: 72, h: 26, label: "Tag",
    htmlMapping: "`<span class=\"tag\">`", desc: "标签：圆角胶囊 + 左圆点 + 文字",
    parts: [box(), ell(8, 10, 6, 6), txt(22, 5, "Tag", { align: "left" })],
  },
  {
    name: "Divider", type: "Divider", category: "展示", w: 320, h: 16, label: "",
    htmlMapping: "`<hr>`", desc: "分割线：水平线",
    parts: [line(0, 8, 320, 0)],
  },

  // ========================= 反馈与状态 =========================
  {
    name: "Alert", type: "Alert", category: "反馈与状态", w: 320, h: 48, label: "Alert message",
    htmlMapping: "`<div role=\"alert\">`", desc: "警告条：左色条 + 图标 + 文字 + ×",
    parts: [box(), rect(0, 0, 6, 48), ell(18, 16, 16, 16), txt(44, 15, "Alert message", { align: "left" }), txt(298, 15, "×")],
  },
  {
    name: "Toast", type: "Toast", category: "反馈与状态", w: 280, h: 64, label: "Notification",
    htmlMapping: "`<div role=\"status\">`（通知/吐司）", desc: "通知：图标 + 标题 + 描述 + ×",
    parts: [box(), ell(14, 14, 20, 20), txt(44, 12, "Notification", { align: "left", fontSize: 14 }), txt(44, 36, "Description text", { align: "left", fontSize: 12 }), txt(258, 12, "×")],
  },
  {
    name: "Tooltip", type: "Tooltip", category: "反馈与状态", w: 120, h: 32, label: "Tooltip",
    htmlMapping: "`<div role=\"tooltip\">`", desc: "提示气泡：小框 + 文字 + 底部三角",
    parts: [box(), ctxt("Tooltip", { fontSize: 12 }), line(54, 32, 6, 6), line(66, 32, -6, 6)],
  },
  {
    name: "Popover", type: "Popover", category: "反馈与状态", w: 200, h: 120, label: "Title",
    htmlMapping: "`<div role=\"dialog\">`（popover）", desc: "气泡卡：标题 + 正文 + 指示三角",
    parts: [box(), line(0, 32, 200, 0), txt(12, 9, "Title", { align: "left" }), txt(12, 44, "Popover content here", { align: "left", fontSize: 12 }), line(94, 120, 8, 8), line(110, 120, -8, 8)],
  },
  {
    name: "Popconfirm", type: "Popconfirm", category: "反馈与状态", w: 220, h: 100, label: "Are you sure?",
    htmlMapping: "确认气泡（popover + 确认/取消按钮）", desc: "确认气泡：提示 + 底部两按钮",
    parts: [box(), txt(12, 14, "Are you sure?", { align: "left", fontSize: 13 }), rect(108, 56, 46, 28), rect(162, 56, 46, 28), txt(120, 62, "No", { align: "left", fontSize: 12 }), txt(174, 62, "Yes", { align: "left", fontSize: 12 })],
  },
  {
    name: "Progress", type: "Progress", category: "反馈与状态", w: 240, h: 12, label: "",
    htmlMapping: "`<progress>` 或 `<div role=\"progressbar\">`", desc: "进度条：轨道矩形 + 60% 填充",
    parts: [box(), rect(0, 0, "60%", "100%")],
  },
  {
    name: "ProgressCircle", type: "ProgressCircle", category: "反馈与状态", w: 64, h: 64, label: "60%", fontSize: 14,
    htmlMapping: "环形 `<div role=\"progressbar\">`", desc: "环形进度：圆环 + 中央百分比",
    parts: [eBox(), ctxt("60%", { fontSize: 14 })],
  },
  {
    name: "Spinner", type: "Spinner", category: "反馈与状态", w: 40, h: 40, label: "",
    htmlMapping: "加载指示器 `<div role=\"status\">`", desc: "加载圈：圆环 + 缺口指示",
    parts: [eBox(), line(20, 2, 0, 10)],
  },
  {
    name: "Skeleton", type: "Skeleton", category: "反馈与状态", w: 240, h: 80, label: "",
    htmlMapping: "骨架占位 `<div class=\"skeleton\">`", desc: "骨架屏：多条灰条（宽度递减）",
    parts: [box(), rect(12, 14, 200, 12), rect(12, 38, 216, 12), rect(12, 58, 120, 12)],
  },
  {
    name: "Empty", type: "Empty", category: "反馈与状态", w: 200, h: 140, label: "No Data",
    htmlMapping: "空状态 `<div>`（插画 + 文案）", desc: "空状态：占位图 + 「暂无数据」",
    parts: [box(), rect(70, 28, 60, 50), line(70, 28, 60, 50), line(70, 78, 60, -50), txt(64, 98, "No Data", { align: "left" })],
  },
  {
    name: "Result", type: "Result", category: "反馈与状态", w: 240, h: 160, label: "Success",
    htmlMapping: "结果页 `<div>`（状态图 + 标题 + 操作）", desc: "结果页：大圆图标 + 标题 + 描述",
    parts: [box(), ell(96, 24, 48, 48), txt(70, 88, "Success", { align: "left", fontSize: 16 }), txt(112, 36, "✓", { align: "left", fontSize: 24 }), txt(52, 116, "Operation completed", { align: "left", fontSize: 12 })],
  },

  // ========================= 数据展示 =========================
  {
    name: "List", type: "List", category: "数据展示", w: 240, h: 160, label: "List item",
    htmlMapping: "`<ul>` / `<ol>` + `<li>`", desc: "列表：多条「圆点 + 文字 + 分隔线」",
    parts: [box(), ell(12, 16, 8, 8, rep(4, 0, 40)), txt(28, 12, "List item", { align: "left", ...rep(4, 0, 40) }), line(0, 40, 240, 0, rep(3, 0, 40))],
  },
  {
    name: "Table", type: "Table", category: "数据展示", w: 320, h: 160, label: "Table",
    htmlMapping: "`<table>` + `<thead>` / `<tbody>`", desc: "表格：表头分隔 + 行线 + 列线",
    parts: [box(), line(0, 32, 320, 0), line(0, 64, 320, 0, rep(3, 0, 32)), line(107, 0, 0, 160, rep(2, 106, 0)), txt(8, 7, "Table", { align: "left" })],
  },
  {
    name: "Grid", type: "Grid", category: "数据展示", w: 320, h: 200, label: "Grid",
    htmlMapping: "`display:grid` 的容器 `<div>` + 网格项", desc: "网格：2×3 网格分隔线",
    parts: [box(), line(0, 100, 320, 0), line(107, 0, 0, 200, rep(2, 106, 0))],
  },
  {
    name: "Tree", type: "Tree", category: "数据展示", w: 240, h: 180, label: "Root",
    htmlMapping: "树形 `<ul>`（嵌套缩进）", desc: "树：多层级行（缩进 + ▾/▸）",
    parts: [box(), txt(12, 12, "▾ Root", { align: "left" }), txt(32, 40, "▾ Folder", { align: "left" }), txt(52, 68, "File 1", { align: "left" }), txt(52, 96, "File 2", { align: "left" }), txt(32, 124, "▸ Folder 2", { align: "left" })],
  },
  {
    name: "Timeline", type: "Timeline", category: "数据展示", w: 240, h: 200, label: "Event 1",
    htmlMapping: "`<ol>` 时间线（节点 + 内容）", desc: "时间线：左竖线 + 节点圆点 + 文字",
    parts: [box(), line(24, 8, 0, 184), ell(18, 14, 12, 12, rep(4, 0, 48)), txt(44, 14, "Event 1", { align: "left" }), txt(44, 62, "Event 2", { align: "left" }), txt(44, 110, "Event 3", { align: "left" }), txt(44, 158, "Event 4", { align: "left" })],
  },
  {
    name: "Statistic", type: "Statistic", category: "数据展示", w: 160, h: 80, label: "Total Users",
    htmlMapping: "统计卡 `<div>`（标题 + 数值）", desc: "统计数值：标题 + 大数字",
    parts: [box(), txt(12, 12, "Total Users", { align: "left", fontSize: 12 }), txt(12, 36, "1,234", { align: "left", fontSize: 28 })],
  },
  {
    name: "Descriptions", type: "Descriptions", category: "数据展示", w: 320, h: 160, label: "Name",
    htmlMapping: "`<dl>` + `<dt>` / `<dd>`", desc: "描述列表：多行「标签：值」",
    parts: [box(), line(0, 40, 320, 0, rep(3, 0, 40)), line(150, 0, 0, 160), txt(12, 11, "Name", { align: "left" }), txt(162, 11, "Alice", { align: "left" }), txt(12, 51, "Age", { align: "left" }), txt(162, 51, "30", { align: "left" }), txt(12, 91, "Email", { align: "left" }), txt(162, 91, "a@b.com", { align: "left" }), txt(12, 131, "Role", { align: "left" }), txt(162, 131, "Admin", { align: "left" })],
  },
  {
    name: "Calendar", type: "Calendar", category: "数据展示", w: 280, h: 240, label: "May 2026",
    htmlMapping: "日历网格 `<table>` / `<div>`", desc: "日历：月份栏 + 7×5 日期网格",
    parts: [box(), line(0, 40, 280, 0), txt(12, 12, "May 2026", { align: "left" }), line(40, 40, 0, 200, rep(6, 40, 0)), line(0, 80, 280, 0, rep(4, 0, 40))],
  },
  {
    name: "Carousel", type: "Carousel", category: "数据展示", w: 320, h: 180, label: "Carousel",
    htmlMapping: "轮播 `<div>`（图片 + 指示点）", desc: "轮播：图片占位 + 左右 ‹ › + 指示点",
    parts: [box(), line(0, 0, 320, 180), line(0, 180, 320, -180), txt(10, 78, "‹", { align: "left", fontSize: 24 }), txt(300, 78, "›", { align: "left", fontSize: 24 }), ell(144, 164, 8, 8, rep(3, 16, 0))],
  },
  {
    name: "BarChart", type: "BarChart", category: "数据展示", w: 240, h: 160, label: "BarChart",
    htmlMapping: "图表占位 `<div>`（柱状）", desc: "柱状图：基线 + 高低不一的柱",
    parts: [box(), line(20, 140, 200, 0), rect(40, 90, 24, 50), rect(80, 60, 24, 80), rect(120, 100, 24, 40), rect(160, 40, 24, 100)],
  },
  {
    name: "LineChart", type: "LineChart", category: "数据展示", w: 240, h: 160, label: "LineChart",
    htmlMapping: "图表占位 `<div>`（折线）", desc: "折线图：基线 + 多段折线",
    parts: [box(), line(20, 140, 200, 0), line(20, 120, 40, -40), line(60, 80, 40, 30), line(100, 110, 40, -50), line(140, 60, 40, 40)],
  },
  {
    name: "PieChart", type: "PieChart", category: "数据展示", w: 160, h: 160, label: "PieChart",
    htmlMapping: "图表占位 `<div>`（饼图）", desc: "饼图：外圆 + 半径分割线",
    parts: [eBox(), line(80, 80, 76, 0), line(80, 80, 0, -76)],
  },

  // ========================= 动作 =========================
  {
    name: "Button", type: "Button", category: "动作", w: 120, h: 40, label: "Button",
    htmlMapping: "`<button>`", desc: "按钮：实心观感框 + 居中文字",
    parts: [box(), ctxt("Button")],
  },
  {
    name: "Link", type: "Link", category: "动作", w: 100, h: 24, label: "Link",
    htmlMapping: "`<a href=\"#\">`", desc: "链接：带下划线文字",
    parts: [txt(0, 0, "Link", { align: "left" }), line(0, 20, 32, 0)],
  },
  {
    name: "ButtonGroup", type: "ButtonGroup", category: "动作", w: 240, h: 40, label: "One",
    htmlMapping: "一组 `<button>`（相邻分段）", desc: "按钮组：竖分隔分 3 段",
    parts: [box(), line(80, 0, 0, 40), line(160, 0, 0, 40), txt(24, 11, "One", { align: "left" }), txt(104, 11, "Two", { align: "left" }), txt(180, 11, "Three", { align: "left" })],
  },
  {
    name: "FAB", type: "FAB", category: "动作", w: 56, h: 56, label: "+", fontSize: 28,
    htmlMapping: "圆形浮动 `<button>`（FloatButton）", desc: "悬浮按钮：圆形 + 中央 ＋",
    parts: [eBox(), ctxt("＋", { fontSize: 28 })],
  },

  // ========================= 媒体 =========================
  {
    name: "Video", type: "Video", category: "媒体", w: 320, h: 180, label: "Video",
    htmlMapping: "`<video controls>`", desc: "视频：播放圆钮 + 底部控制条",
    parts: [box(), ell(134, 64, 48, 48), txt(150, 74, "▶", { align: "left", fontSize: 20 }), line(0, 160, 320, 0)],
  },
  {
    name: "Audio", type: "Audio", category: "媒体", w: 280, h: 40, label: "Audio",
    htmlMapping: "`<audio controls>`", desc: "音频：播放钮 + 进度线 + 时间",
    parts: [box(), txt(12, 9, "▶", { align: "left", fontSize: 16 }), line(40, 20, 184, 0), txt(232, 11, "0:00", { align: "left", fontSize: 12 })],
  },
  {
    name: "Map", type: "Map", category: "媒体", w: 320, h: 200, label: "Map",
    htmlMapping: "地图占位 `<div>`（街道 + 标记）", desc: "地图：街道网格 + 中央标记点",
    parts: [box(), line(0, 60, 320, 0, rep(2, 0, 70)), line(80, 0, 0, 200, rep(3, 80, 0)), ell(150, 84, 18, 18), ell(156, 90, 6, 6)],
  },
];

// —— 派生数据（供生成器使用） ——
/** {type: {w,h,fontSize?}} —— 写入两个 build-scene 的 CONTROL_SPECS */
export const specsMap = Object.fromEntries(
  CONTROLS.map((c) => [c.type, c.fontSize ? { w: c.w, h: c.h, fontSize: c.fontSize } : { w: c.w, h: c.h }]),
);

/** {type: parts} —— 仅 gen-controls.mjs 在构建 palette 时使用 */
export const compositionMap = Object.fromEntries(
  CONTROLS.filter((c) => c.parts && c.parts.length).map((c) => [c.type, c.parts]),
);
