// 选中覆盖层：父级 DOM，绝对定位叠在 .preview-wrap 上（不进 iframe，避免污染导出的 HTML）。
// 据选中元素换算到容器坐标系的 rect 画选框 + 8 个 resize 手柄；手柄按下时上抛方位给父级。
// 选框本身 pointer-events:none，不挡 iframe 的点选；仅手柄可交互。

import type { PointerEvent } from "react";
import type { Rect } from "../lib/domEdit";

export type HandleDir = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

const HANDLES: HandleDir[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

type Props = {
  rect: Rect | null;
  onHandleDown: (dir: HandleDir, e: PointerEvent) => void;
};

export default function SelectionOverlay({ rect, onHandleDown }: Props) {
  if (!rect) return null;
  return (
    <div
      className="sel-overlay"
      style={{ left: rect.left, top: rect.top, width: rect.width, height: rect.height }}
    >
      {HANDLES.map((dir) => (
        <span
          key={dir}
          className="ucd-handle"
          data-dir={dir}
          onPointerDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onHandleDown(dir, e);
          }}
        />
      ))}
    </div>
  );
}
