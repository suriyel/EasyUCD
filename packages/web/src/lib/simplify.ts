// JSON 简化器：把 Excalidraw 原始元素数组（每个含 ~50 字段）压缩为 LLM 需要的最小结构。
// 设计文档 §4.3。复杂度 O(n)。

/** 简化后的单个逻辑控件 */
export type SimplifiedElement = {
  id: string;
  /** 控件类型（来自 customData.controlType）或几何类型（rectangle/ellipse/...） */
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** 文字内容（若有） */
  text?: string;
  /** 父容器 id（来自绑定文字的 containerId；几何嵌套交给 LLM 从坐标推断） */
  parent?: string;
};

export type SimplifyResult = {
  elements: SimplifiedElement[];
  notes: string;
};

// Excalidraw 原始元素只取我们关心的字段，其余忽略（schema 升级时更稳健）。
export type RawElement = {
  id: string;
  type: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  isDeleted?: boolean;
  groupIds?: string[];
  containerId?: string | null;
  text?: string;
  customData?: { controlType?: string } | null;
};

/**
 * 把原始 Excalidraw 元素数组简化为逻辑控件数组。
 * - 过滤已删除元素
 * - 按 groupIds[0] 合并同组元素（控件库里 矩形+文字 共享一个 group）
 * - 每组取 controlType 作类型、合并文字、以矩形作几何边界
 */
export function simplify(rawElements: RawElement[], notes?: string): SimplifyResult {
  // 第一遍：过滤已删除元素，按 groupIds 合并同组元素
  const groups = new Map<string, RawElement[]>();
  for (const el of rawElements) {
    if (el.isDeleted) continue;
    const key = el.groupIds?.[0] || el.id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(el);
  }

  // 第二遍：每组合并为一个逻辑控件
  const elements: SimplifiedElement[] = [];
  for (const [key, group] of groups) {
    const controlType = group.find((e) => e.customData?.controlType)?.customData?.controlType;
    const textEl = group.find((e) => e.type === "text" && typeof e.text === "string" && e.text.trim() !== "");
    const bgEl = group.find((e) => e.type === "rectangle") ?? group[0];

    const text = textEl?.text?.trim();
    const parent = bgEl.containerId ?? textEl?.containerId ?? undefined;

    elements.push({
      id: key,
      type: controlType || bgEl.type,
      x: Math.round(bgEl.x ?? 0),
      y: Math.round(bgEl.y ?? 0),
      w: Math.round(bgEl.width ?? 0),
      h: Math.round(bgEl.height ?? 0),
      ...(text ? { text } : {}),
      ...(parent ? { parent } : {}),
    });
  }

  return { elements, notes: notes || "" };
}
