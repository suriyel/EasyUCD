// 自定义分类控件面板（取代 Excalidraw 原生 Library 面板）。
// 内置控件来自 /wireframe-controls.catalog.json（由 scripts/gen-controls.mjs 生成）；
// 用户自绘并经原生「添加到资源库」存下的控件（customControls，localStorage）合并进来，
// 归入「我的控件」分类、置于面板顶部，并可删除。
// 按分类折叠归档，每个控件显示 SVG 缩略图 + 下方中文名。
// 交互：点击控件 → 克隆其 elements（重映射 id/group、保留分组结构）注入画布视口中央，再由用户拖动定位。

import { useEffect, useMemo, useState } from "react";
import type { ExcalidrawAPI } from "./ExcalidrawCanvas";
import { CUSTOM_CATEGORY, type CatalogItem } from "../lib/customControls";
import { cloneElementsForInsert } from "../lib/cloneElements";

type Props = {
  api: ExcalidrawAPI | null;
  customControls: CatalogItem[];
  onDeleteCustom: (type: string) => void;
};

// 分组展示顺序。「我的控件」置顶便于复用；其余与 scripts/control-catalog.mjs 的 CATEGORIES 一致。
// catalog 已按内置分类排序，此处用于稳定分组顺序、并兜底处理未知分类（追加到末尾）。
const CATEGORY_ORDER = [
  CUSTOM_CATEGORY,
  "容器", "导航", "输入", "表单进阶", "选择进阶",
  "展示", "反馈与状态", "数据展示", "动作", "媒体",
];

let insertSeq = 0;

export default function ControlPalette({ api, customControls, onDeleteCustom }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState("");

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

  // 归一化查询：子串匹配中文名 / 英文名 / 类型 / 分类（大小写不敏感）。
  const q = query.trim().toLowerCase();

  // 合并内置 + 自定义控件后按分类分组（先按查询过滤，再保留分类内顺序）。
  const groups = useMemo(() => {
    const all = [...customControls, ...items];
    const matched = q
      ? all.filter((it) =>
          [it.cnName, it.name, it.type, it.category].some((f) => f.toLowerCase().includes(q)),
        )
      : all;
    const map = new Map<string, CatalogItem[]>();
    for (const it of matched) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    const known = CATEGORY_ORDER.filter((c) => map.has(c));
    const extra = [...map.keys()].filter((c) => !CATEGORY_ORDER.includes(c));
    return [...known, ...extra].map((c) => [c, map.get(c)!] as const);
  }, [items, customControls, q]);

  const matchCount = useMemo(() => groups.reduce((n, [, list]) => n + list.length, 0), [groups]);

  // 点击插入：把控件 elements 克隆到画布视口中央。
  // 用 cloneElementsForInsert 重映射 id/groupIds（保留分组结构），而非拍平成单一 group——
  // 否则「多控件组合」会被 simplify 塌缩成单个逻辑控件，生成 HTML 退化（与导出再导入差距大）。
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

    const newEls = cloneElementsForInsert(it.elements, tx, ty);
    api.updateScene({ elements: [...api.getSceneElements(), ...newEls] });
  };

  return (
    <div className="control-palette">
      <div className="palette-head">控件库（点击插入）</div>
      <div className="palette-search">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索控件…（中文/英文/分类）"
          aria-label="搜索控件"
        />
        {query && (
          <button
            type="button"
            className="clear"
            title="清除搜索"
            aria-label="清除搜索"
            onClick={() => setQuery("")}
          >
            ×
          </button>
        )}
        {q && <span className="hits">{matchCount} 个结果</span>}
      </div>
      {q && groups.length === 0 && <div className="palette-empty">无匹配控件</div>}
      {groups.map(([cat, list]) => {
        const isOpen = q ? true : !collapsed[cat];
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
                {list.map((it) => {
                  const card = (
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
                  );
                  if (it.category !== CUSTOM_CATEGORY) return card;
                  // 自定义控件：包一层以容纳删除按钮（避免 button 嵌套 button）。
                  return (
                    <div className="palette-item-wrap" key={it.type}>
                      {card}
                      <button
                        type="button"
                        className="palette-del"
                        title="删除此控件"
                        aria-label="删除此控件"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`删除自定义控件「${it.cnName}」？`)) onDeleteCustom(it.type);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
