// 可视化编辑器的无 React 纯函数工具：元素标识、样式读写、几何换算、文档序列化清理。
// 编辑器在父级直接操作 iframe.contentDocument（同源），这里的函数全部以 HTMLElement / Document 为入参。
// 抽成纯函数便于单测，也让 PreviewEditor 只管编排、不掺杂细节。

export type Rect = { left: number; top: number; width: number; height: number };

// 属性面板的元素样式模型（读 getComputedStyle 得到）。
export type StyleModel = {
  tag: string; // 元素标签 + 简短 class，仅展示
  text: string; // 文字内容（仅纯文本叶子可编辑）
  isTextLeaf: boolean; // 是否纯文本叶子（决定文字 textarea 是否启用）
  color: string; // hex
  background: string; // hex（透明时给个白底占位）
  bgTransparent: boolean;
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

/** "rgb(r,g,b)" / "rgba(r,g,b,a)" → "#rrggbb"。解析失败回退黑色。 */
export function rgbToHex(rgb: string): string {
  const m = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(rgb || "");
  if (!m) return "#000000";
  const hex = (n: number) => Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0");
  return "#" + hex(+m[1]) + hex(+m[2]) + hex(+m[3]);
}

/** 背景是否完全透明（transparent 或 rgba alpha=0）。仅 rgba 才看第 4 位，避免把 rgb 的蓝色误当 alpha。 */
function bgAlphaZero(bg: string): boolean {
  if (!bg || bg === "transparent") return true;
  const m = /rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)/.exec(bg);
  return m ? parseFloat(m[1]) === 0 : false;
}

/** 读元素的可编辑样式快照，喂给属性面板展示。 */
export function readStyleModel(el: HTMLElement): StyleModel {
  const cs = getComputedStyle(el);
  const rect = el.getBoundingClientRect();
  const cls = el.getAttribute("class");
  const tag = el.tagName.toLowerCase() + (cls ? `.${cls.trim().split(/\s+/)[0]}` : "");
  return {
    tag,
    text: isTextLeaf(el) ? el.textContent ?? "" : "",
    isTextLeaf: isTextLeaf(el),
    color: rgbToHex(cs.color),
    background: bgAlphaZero(cs.backgroundColor) ? "#ffffff" : rgbToHex(cs.backgroundColor),
    bgTransparent: bgAlphaZero(cs.backgroundColor),
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
  if (patch.text !== undefined && isTextLeaf(el)) el.textContent = patch.text;
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
