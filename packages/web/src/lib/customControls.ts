// 自定义控件库：用户在画布上自绘并通过原生「添加到资源库」存下的控件。
// 持久化到浏览器 localStorage（catalog.json 在 public/ 由构建生成，运行时不可追加）。
// 这里提供：共享的 CatalogItem 类型、localStorage 增删查、以及把一组 Excalidraw
// 元素（来自原生 Library 项）转换成与内置控件同形的 CatalogItem（含缩略图 SVG）。

import { exportToSvg } from "@excalidraw/excalidraw";

export type El = { x: number; y: number; width?: number; height?: number; [k: string]: unknown };

// 与 wireframe-controls.catalog.json 的条目同形（ControlPalette 直接消费）。
export type CatalogItem = {
  type: string;
  name: string;
  cnName: string;
  category: string;
  w: number;
  h: number;
  svg: string;
  elements: El[];
};

const KEY = "easyucd.customControls.v1";
/** 自定义控件统一归入的分类名（ControlPalette 据此渲染删除按钮、排序置顶）。 */
export const CUSTOM_CATEGORY = "我的控件";

export function loadCustomControls(): CatalogItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (e) {
    console.warn("读取自定义控件失败：", e);
    return [];
  }
}

function persist(list: CatalogItem[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch (e) {
    console.warn("保存自定义控件失败：", e);
  }
}

export function addCustomControl(item: CatalogItem) {
  const list = loadCustomControls();
  list.push(item);
  persist(list);
}

export function deleteCustomControl(type: string) {
  persist(loadCustomControls().filter((c) => c.type !== type));
}

// 把原生 Library 项的元素转成 CatalogItem：
//   1) 归一化到原点（0,0），便于 ControlPalette.insert() 像内置控件一样按视口中央平移；
//   2) 计算包围盒 w/h；
//   3) 用 exportToSvg 渲染缩略图（保留 Excalidraw 手绘观感），去掉固定宽高仅留 viewBox 以自适应面板。
// 保留元素原有 customData（自绘可能由内置控件拼成），不强行覆写 controlType。
export async function libraryItemToCatalogItem(
  rawElements: readonly El[],
  cnName: string,
): Promise<CatalogItem> {
  const els = rawElements.map((e) => structuredClone(e) as El);

  const minX = Math.min(...els.map((e) => e.x));
  const minY = Math.min(...els.map((e) => e.y));
  const maxX = Math.max(...els.map((e) => e.x + (e.width ?? 0)));
  const maxY = Math.max(...els.map((e) => e.y + (e.height ?? 0)));
  const w = Math.max(1, Math.round(maxX - minX));
  const h = Math.max(1, Math.round(maxY - minY));

  for (const e of els) {
    e.x -= minX;
    e.y -= minY;
  }

  const type = `Custom-${Date.now().toString(36)}`;
  const name = cnName.trim() || type;

  let svg = "";
  try {
    const node = await exportToSvg({
      elements: els as never,
      appState: { exportBackground: false, viewBackgroundColor: "transparent" } as never,
      files: null as never,
      exportPadding: 4,
      skipInliningFonts: true,
    });
    // 去掉固定 width/height，仅留 viewBox，使缩略图随 .palette-thumb 自适应缩放（与内置项一致）。
    node.removeAttribute("width");
    node.removeAttribute("height");
    svg = new XMLSerializer().serializeToString(node);
  } catch (e) {
    console.warn("生成控件缩略图失败，使用占位：", e);
    svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"><rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" fill="none" stroke="#1e1e1e"/></svg>`;
  }

  return { type, name, cnName: name, category: CUSTOM_CATEGORY, w, h, svg, elements: els };
}
