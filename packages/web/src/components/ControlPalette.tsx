// 自定义分类控件面板（取代 Excalidraw 原生 Library 面板）。
// 数据来自 /wireframe-controls.catalog.json（由 scripts/gen-controls.mjs 生成）：
// 按分类（10 组）折叠归档，每个控件显示 SVG 缩略图 + 下方中文名。
// 交互：点击控件 → 克隆其 elements 注入画布视口中央（再由用户在画布内拖动定位）。

import { useEffect, useMemo, useState } from "react";
import type { ExcalidrawAPI } from "./ExcalidrawCanvas";

type El = { x: number; y: number; [k: string]: unknown };
type CatalogItem = {
  type: string;
  name: string;
  cnName: string;
  category: string;
  w: number;
  h: number;
  svg: string;
  elements: El[];
};

type Props = { api: ExcalidrawAPI | null };

// 分组展示顺序（与 scripts/control-catalog.mjs 的 CATEGORIES 一致）。catalog 已按此排序，
// 此处仅用于稳定分组顺序、并兜底处理未知分类（追加到末尾）。
const CATEGORY_ORDER = [
  "容器", "导航", "输入", "表单进阶", "选择进阶",
  "展示", "反馈与状态", "数据展示", "动作", "媒体",
];

let insertSeq = 0;

export default function ControlPalette({ api }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    fetch("/wireframe-controls.catalog.json")
      .then((r) => r.json())
      .then((data: CatalogItem[]) => {
        if (!cancelled) setItems(Array.isArray(data) ? data : []);
      })
      .catch((e) => console.warn("加载控件目录失败：", e));
    return () => {
      cancelled = true;
    };
  }, []);

  // 按分类分组（保留 catalog 内顺序）
  const groups = useMemo(() => {
    const map = new Map<string, CatalogItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    const known = CATEGORY_ORDER.filter((c) => map.has(c));
    const extra = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...extra].map((c) => [c, map.get(c)!] as const);
  }, [items]);

  // 点击插入：把控件 elements 克隆到画布视口中央。
  const insert = (it: CatalogItem) => {
    if (!api) return;
    const st = api.getAppState();
    const zoom = st.zoom?.value || 1;
    // Excalidraw: sceneX = (clientX - offsetLeft)/zoom - scrollX；视口中央取 clientX-offsetLeft = width/2
    const cx = st.width / 2 / zoom - st.scrollX;
    const cy = st.height / 2 / zoom - st.scrollY;
    const seq = insertSeq++;
    const off = (seq % 6) * 16; // 连续插入时级联错开，避免完全重叠
    const tx = Math.round(cx - it.w / 2) + off;
    const ty = Math.round(cy - it.h / 2) + off;

    const tag = `${Date.now().toString(36)}-${seq}`;
    const gid = `g-${tag}`;
    const newEls = it.elements.map((el, i) => {
      const c = structuredClone(el) as El;
      c.id = `${it.type.toLowerCase()}-${tag}-${i}`;
      c.groupIds = [gid];
      c.x = el.x + tx;
      c.y = el.y + ty;
      c.seed = Math.floor(Math.random() * 2 ** 31);
      c.versionNonce = Math.floor(Math.random() * 2 ** 31);
      return c;
    });
    api.updateScene({ elements: [...api.getSceneElements(), ...newEls] });
  };

  return (
    <div className="control-palette">
      <div className="palette-head">控件库（点击插入）</div>
      {groups.map(([cat, list]) => {
        const isOpen = !collapsed[cat];
        return (
          <div className="palette-category" key={cat}>
            <button
              type="button"
              className="palette-cat-head"
              onClick={() => setCollapsed((s) => ({ ...s, [cat]: !s[cat] }))}
            >
              <span className="caret">{isOpen ? "▾" : "▸"}</span>
              <span className="cat-name">{cat}</span>
              <span className="cat-count">{list.length}</span>
            </button>
            {isOpen && (
              <div className="palette-grid">
                {list.map((it) => (
                  <button
                    type="button"
                    key={it.type}
                    className="palette-item"
                    title={`${it.cnName}（${it.type}）`}
                    onClick={() => insert(it)}
                  >
                    <span
                      className="palette-thumb"
                      dangerouslySetInnerHTML={{ __html: it.svg }}
                    />
                    <span className="palette-label">{it.cnName}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
