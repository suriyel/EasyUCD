import { useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import ControlPalette from "./ControlPalette";

// 仅声明我们用到的 API 方法，避免耦合 Excalidraw 内部类型路径。
export type ExcalidrawAPI = {
  getSceneElements: () => readonly unknown[];
  updateScene: (scene: { elements?: unknown[] }) => void;
  // 视口换算用：scrollX/scrollY 为场景单位，zoom.value 为缩放，width/height 为画布像素尺寸。
  getAppState: () => {
    width: number;
    height: number;
    scrollX: number;
    scrollY: number;
    zoom: { value: number };
  };
};

type Props = { onApi: (api: ExcalidrawAPI) => void };

/**
 * 左栏画板。左侧是自定义分类控件面板（ControlPalette，点击插入控件到画布），
 * 右侧是 Excalidraw 画布。Excalidraw 原生 Library 面板已隐藏（见 index.css），
 * 控件改由 /wireframe-controls.catalog.json 驱动的分类面板提供。设计文档 §4.1.3。
 */
export default function ExcalidrawCanvas({ onApi }: Props) {
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);

  return (
    <div className="canvas-row">
      <div className="canvas-area">
        <Excalidraw
          excalidrawAPI={(a) => {
            const typed = a as unknown as ExcalidrawAPI;
            setApi(typed);
            onApi(typed);
          }}
        />
      </div>
      <ControlPalette api={api} />
    </div>
  );
}
