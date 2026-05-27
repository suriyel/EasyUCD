// 可视化编辑器的无 React 纯函数工具：元素标识、样式读写、几何换算、文档序列化清理。
// 编辑器在父级直接操作 iframe.contentDocument（同源），这里的函数全部以 HTMLElement / Document 为入参。
// 抽成纯函数便于单测，也让 PreviewEditor 只管编排、不掺杂细节。

export type Rect = { left: number; top: number; width: number; height: number };

// 属性面板的元素样式模型（读 getComputedStyle 得到）。
export type StyleModel = {
  tag: string; // 元素标签 + 简短 class，仅展示
  text: string; // 文字内容 / 表单控件的值（仅纯文本叶子或表单控件可编辑）
  isTextLeaf: boolean; // 是否纯文本叶子（决定文字 textarea 是否启用）
  valueKind: "field" | "text"; // field=表单控件的 value；text=普通元素 textContent
  color: string; // hex
  background: string; // hex（透明时给个白底占位）
  bgTransparent: boolean;
  bgIsImage: boolean; // 背景为渐变/图片（background-image 非 none）：仅提示，不当透明处理
  fontSize: number; // px
  fontFamily: string; // 原始 computed 值
  borderWidth: number;
  borderStyle: string;
  borderColor: string; // hex
  borderRadius: number;
  padding: number;
  margin: number;
  width: number;
  height: number;
};

// 面板改值时上抛的补丁（每个字段都映射到一条 inline style，text 例外）。
export type StylePatch = Partial<{
  text: string;
  color: string;
  background: string; // hex 或 "transparent"
  fontSize: number;
  fontFamily: string;
  borderWidth: number;
  borderStyle: string;
  borderColor: string;
  borderRadius: number;
  padding: number;
  margin: number;
  width: number;
  height: number;
}>;

// 编辑期临时标记属性 / class，序列化导出前必须清理干净。
const EDIT_ATTRS = ["data-ucd-id", "data-ucd-tx"];
const EDIT_CLASS = "ucd-editing";

let eidSeq = 0;

/** 选中即给元素打一个稳定的 data-ucd-id，供 overlay 的 React key 与跨重渲染关联。 */
export function ensureEid(el: HTMLElement): string {
  let id = el.getAttribute("data-ucd-id");
  if (!id) {
    id = `ucd-${Date.now().toString(36)}-${eidSeq++}`;
    el.setAttribute("data-ucd-id", id);
  }
  return id;
}

/** 纯文本叶子：没有任何元素子节点（只含文本）。富节点不允许用 textContent 整体改写。 */
export function isTextLeaf(el: HTMLElement): boolean {
  return !Array.from(el.childNodes).some((n) => n.nodeType === 1 /* ELEMENT_NODE */);
}

// 把任意 CSS 颜色（含 oklch/hsl/color()/named/逗号或空格式 rgb 等）解析为 RGBA 通道。
// 关键：canvas fillStyle 对新式语法（如 oklch）只会原样回显、不归一为 rgb；但把颜色「画」到
// 1×1 画布再读像素，能拿到浏览器实际渲染的 sRGB 值，覆盖一切可渲染颜色。比正则可靠得多。
let _cctx: CanvasRenderingContext2D | null | undefined;
type RGBA = { r: number; g: number; b: number; a: number };
function parseColorRGBA(input: string): RGBA | null {
  if (!input || input === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  if (_cctx === undefined) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = 1;
    _cctx = cv.getContext("2d", { willReadFrequently: true });
  }
  if (!_cctx) return null;
  _cctx.clearRect(0, 0, 1, 1);
  _cctx.fillStyle = "#000000"; // 哨兵：input 不被接受时保持黑色
  _cctx.fillStyle = input;
  _cctx.fillRect(0, 0, 1, 1);
  const d = _cctx.getImageData(0, 0, 1, 1).data;
  return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
}

/** 任意 CSS 颜色 → "#rrggbb"。解析失败回退黑色。 */
export function rgbToHex(input: string): string {
  const c = parseColorRGBA(input);
  if (!c) return "#000000";
  const hex = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, "0");
  return "#" + hex(c.r) + hex(c.g) + hex(c.b);
}

/** 颜色的 alpha（0–1）。完全透明（transparent / alpha=0）时为 0。 */
function colorAlpha(input: string): number {
  const c = parseColorRGBA(input);
  return c ? c.a : 1;
}

/** 是否表单控件（其可编辑“值”在 .value，而非 textContent）。
 *  用 tagName 判断而非 instanceof —— iframe 内元素属于另一 realm，instanceof 父窗口的
 *  HTMLInputElement 会恒为 false。 */
function isFormField(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA";
}

/** 读元素的可编辑样式快照，喂给属性面板展示。 */
export function readStyleModel(el: HTMLElement): StyleModel {
  // 关键：必须用元素自身文档的视图取 computed 样式。iframe 内元素若用父窗口的
  // getComputedStyle，部分浏览器会返回默认/空值，导致面板全字段失真。
  const win = el.ownerDocument.defaultView ?? window;
  const cs = win.getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const cls = el.getAttribute("class");
  const tag = el.tagName.toLowerCase() + (cls ? `.${cls.trim().split(/\s+/)[0]}` : "");
  const field = isFormField(el);
  const bgAlpha = colorAlpha(cs.backgroundColor);
  const bgIsImage = cs.backgroundImage !== "none";
  return {
    tag,
    text: field ? el.value : isTextLeaf(el) ? el.textContent ?? "" : "",
    isTextLeaf: field || isTextLeaf(el),
    valueKind: field ? "field" : "text",
    color: rgbToHex(cs.color),
    background: bgAlpha === 0 ? "#ffffff" : rgbToHex(cs.backgroundColor),
    bgTransparent: bgAlpha === 0 && !bgIsImage,
    bgIsImage,
    fontSize: Math.round(parseFloat(cs.fontSize) || 0),
    fontFamily: cs.fontFamily,
    borderWidth: Math.round(parseFloat(cs.borderTopWidth) || 0),
    borderStyle: cs.borderTopStyle === "none" ? "solid" : cs.borderTopStyle,
    borderColor: rgbToHex(cs.borderTopColor),
    borderRadius: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
    padding: Math.round(parseFloat(cs.paddingTop) || 0),
    margin: Math.round(parseFloat(cs.marginTop) || 0),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  };
}

/** 把面板补丁写成 inline style（inline 优先级最高，覆盖原 class 样式）。 */
export function writeStyle(el: HTMLElement, patch: StylePatch) {
  const s = el.style;
  if (patch.text !== undefined) {
    if (isFormField(el)) {
      el.value = patch.text; // 表单控件改“值”
      el.setAttribute("value", patch.text); // 反映到属性，使序列化后的 HTML 保留
    } else if (isTextLeaf(el)) {
      el.textContent = patch.text;
    }
  }
  if (patch.color !== undefined) s.color = patch.color;
  if (patch.background !== undefined) s.background = patch.background;
  if (patch.fontSize !== undefined) s.fontSize = `${patch.fontSize}px`;
  if (patch.fontFamily !== undefined) s.fontFamily = patch.fontFamily;
  if (patch.borderWidth !== undefined) s.borderWidth = `${patch.borderWidth}px`;
  if (patch.borderStyle !== undefined) s.borderStyle = patch.borderStyle;
  if (patch.borderColor !== undefined) s.borderColor = patch.borderColor;
  if (patch.borderRadius !== undefined) s.borderRadius = `${patch.borderRadius}px`;
  if (patch.padding !== undefined) s.padding = `${patch.padding}px`;
  if (patch.margin !== undefined) s.margin = `${patch.margin}px`;
  if (patch.width !== undefined) s.width = `${patch.width}px`;
  if (patch.height !== undefined) s.height = `${patch.height}px`;
}

/** 读元素当前的 translate 位移（自由拖拽用 transform，可逆且不破坏文档流）。 */
export function getTranslate(el: HTMLElement): { x: number; y: number } {
  const m = /translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/.exec(el.style.transform || "");
  return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
}

/** 写 translate 位移。注意：本版本由编辑器独占 transform，不与元素原有 transform 叠加。 */
export function setTranslate(el: HTMLElement, x: number, y: number) {
  el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/**
 * 把 iframe 内元素的几何换算到容器（.preview-wrap）坐标系，用于父级 overlay 定位。
 * getBoundingClientRect 已含 iframe 内部滚动；预留 scale 以备将来整页缩放预览。
 */
export function rectInParent(
  el: HTMLElement,
  iframe: HTMLIFrameElement,
  container: HTMLElement,
  scale = 1,
): Rect {
  const r = el.getBoundingClientRect();
  const f = iframe.getBoundingClientRect();
  const c = container.getBoundingClientRect();
  return {
    left: f.left + r.left * scale - c.left,
    top: f.top + r.top * scale - c.top,
    width: r.width * scale,
    height: r.height * scale,
  };
}

/**
 * 序列化整份文档为可下载/持久化的 HTML：在克隆体上清理所有编辑残留，并补回 <!DOCTYPE html>
 * （outerHTML 不含 doctype，缺了会让再次渲染落入 quirks 模式）。
 */
export function serializeDoc(doc: Document): string {
  const clone = doc.documentElement.cloneNode(true) as HTMLElement;
  for (const attr of EDIT_ATTRS) {
    clone.querySelectorAll(`[${attr}]`).forEach((n) => n.removeAttribute(attr));
  }
  clone.querySelectorAll("[contenteditable]").forEach((n) => n.removeAttribute("contenteditable"));
  clone.querySelectorAll(`.${EDIT_CLASS}`).forEach((n) => {
    n.classList.remove(EDIT_CLASS);
    if (n.getAttribute("class") === "") n.removeAttribute("class");
  });
  return "<!DOCTYPE html>\n" + clone.outerHTML;
}
