import { useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import ControlPalette from "./ControlPalette";
import {
  addCustomControl,
  deleteCustomControl,
  libraryItemToCatalogItem,
  loadCustomControls,
  type CatalogItem,
  type El,
} from "../lib/customControls";

// 仅声明我们用到的 API 方法，避免耦合 Excalidraw 内部类型路径。
export type ExcalidrawAPI = {
  getSceneElements: () => readonly unknown[];
  updateScene: (scene: { elements?: unknown[] }) => void;
  // 清空原生 Library 用：把控件去向从原生库转移到自定义面板后，重置原生库。
  updateLibrary?: (opts: { libraryItems: unknown[]; merge?: boolean }) => void;
  // 视口换算用：scrollX/scrollY 为场景单位，zoom.value 为缩放，width/height 为画布像素尺寸。
  getAppState: () => {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
  };
};

type LibraryItem = { id: string; elements: readonly El[] };

type Props = { onApi: (api: ExcalidrawAPI) => void };

/**
 * 左栏画板。右侧是自定义分类控件面板（ControlPalette，点击插入控件到画布），
 * 左侧是 Excalidraw 画布。Excalidraw 原生 Library 侧栏已隐藏（见 index.css），
 * 内置控件改由 /wireframe-controls.catalog.json 驱动的分类面板提供。设计文档 §4.1.3。
 *
 * 「添加到资源库」改造：保留原生右键手势，但用 onLibraryChange 拦截新增库项，
 * 弹窗命名后转存进自定义控件库（localStorage，「我的控件」分类），随后清空原生库。
 */
export default function ExcalidrawCanvas({ onApi }: Props) {
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  const [customControls, setCustomControls] = useState<CatalogItem[]>(() => loadCustomControls());
  // 已处理过的库项 id（内存态）：避免重复导入。导入后会清空原生库，故重载时原生库为空、不会重复。
  const processed = useRef<Set<string>>(new Set());
  const importing = useRef(false);

  // 拦截原生「添加到资源库」：把新增的库项转存进自定义控件库（替代进入隐藏的原生库）。
  // 不依赖「挂载时是否触发」——凡未处理过的库项都导入，处理后清空原生库。
  const handleLibraryChange = async (libraryItems: readonly LibraryItem[]) => {
    if (importing.current) return; // 屏蔽自身清空原生库引发的回调
    const fresh = libraryItems.filter((i) => i.id && !processed.current.has(i.id));
    if (fresh.length === 0) return;

    importing.current = true;
    try {
      for (const li of fresh) {
        processed.current.add(li.id);
        if (!li.elements?.length) continue;
        const input = window.prompt("控件名称（中文）", "我的控件");
        if (input == null) continue; // 取消则跳过保存（末尾仍会清空原生库）
        addCustomControl(await libraryItemToCatalogItem(li.elements, input));
      }
      // 清空原生库：使其永不堆积、保持隐藏，去向完全转移到自定义面板。
      apiRef.current?.updateLibrary?.({ libraryItems: [], merge: false });
      setCustomControls(loadCustomControls());
    } finally {
      importing.current = false;
    }
  };

  return (
    <div className="canvas-row">
      <div className="canvas-area">
        <Excalidraw
          excalidrawAPI={(a) => {
            const typed = a as unknown as ExcalidrawAPI;
            setApi(typed);
            apiRef.current = typed;
            onApi(typed);
          }}
          onLibraryChange={handleLibraryChange as never}
        />
      </div>
      <ControlPalette
        api={api}
        customControls={customControls}
        onDeleteCustom={(type) => {
          deleteCustomControl(type);
          setCustomControls(loadCustomControls());
        }}
      />
    </div>
  );
}
