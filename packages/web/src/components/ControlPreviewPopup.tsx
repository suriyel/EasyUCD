import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * 控件库缩略图悬停放大预览。
 *
 * Excalidraw 的库面板把每个控件渲染在固定 55×55px 的 `.library-unit` 里，复杂控件看不清。
 * 这里通过事件委托监听悬停，克隆该格子里 Excalidraw 已生成的 `<svg>`（带真实尺寸 + viewBox），
 * 放大到统一大小显示在浮层里——无需把 DOM 映射回具名控件。多数控件本身画了标签文字，放大后即可辨识。
 *
 * 头部「📌 固定」按钮按下后冻结当前内容、停止跟随悬停；「✕」关闭并解除固定。
 */

const MAXW = 260; // 放大目标框宽（px）
const MAXH = 300; // 放大目标框高（px）
const HIDE_DELAY = 120; // 离开后延迟隐藏，防抖避免闪烁（ms）

type Data = { left: number; top: number; svg: SVGSVGElement };

export default function ControlPreviewPopup() {
  const [data, setData] = useState<Data | null>(null);
  const [visible, setVisible] = useState(false);
  const [pinned, setPinned] = useState(false);

  const pinnedRef = useRef(false);
  const hideTimer = useRef<number | null>(null);
  const popupRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);

  // 在一次性绑定的事件处理器里读取最新 pinned 值
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // 把克隆出的 svg 节点挂进弹窗 body（复用 DOM 节点，避免 HTML 序列化往返）
  useLayoutEffect(() => {
    if (visible && data && bodyRef.current) {
      bodyRef.current.replaceChildren(data.svg);
    }
  }, [visible, data]);

  useEffect(() => {
    const cancelHide = () => {
      if (hideTimer.current != null) {
        window.clearTimeout(hideTimer.current);
        hideTimer.current = null;
      }
    };
    const scheduleHide = () => {
      cancelHide();
      hideTimer.current = window.setTimeout(() => setVisible(false), HIDE_DELAY);
    };

    const onPointerOver = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;

      // 悬停在弹窗自身上：保持显示
      if (popupRef.current?.contains(target)) {
        cancelHide();
        return;
      }
      if (pinnedRef.current) return; // 已固定：冻结，不跟随悬停

      const unit = target.closest(".library-unit");
      if (!unit) {
        scheduleHide(); // 既不在库格、也不在弹窗内 → 准备隐藏
        return;
      }

      const svg = unit.querySelector<SVGSVGElement>(".library-unit__dragger svg");
      if (!svg) return; // 骨架格无 svg，跳过

      cancelHide();
      const rect = unit.getBoundingClientRect();
      const clone = svg.cloneNode(true) as SVGSVGElement;

      // 读取真实尺寸（优先 width/height 属性，回退到 viewBox）
      let w = parseFloat(clone.getAttribute("width") || "");
      let h = parseFloat(clone.getAttribute("height") || "");
      if (!w || !h) {
        const vb = (clone.getAttribute("viewBox") || "").split(/[\s,]+/).map(Number);
        if (vb.length === 4) {
          w = vb[2];
          h = vb[3];
        }
      }
      if (!w || !h) {
        w = 100;
        h = 100;
      }

      const scale = Math.min(MAXW / w, MAXH / h);
      const sw = Math.round(w * scale);
      const sh = Math.round(h * scale);
      clone.setAttribute("width", String(sw));
      clone.setAttribute("height", String(sh));
      clone.style.filter = "none";
      clone.style.display = "block";

      // 估算弹窗尺寸用于定位（头部约 24px + 上下内边距；宽度兜底头部最小宽）
      const boxW = Math.max(sw, 150) + 16;
      const boxH = sh + 40;
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // 优先放在格子左侧（库侧栏靠右，弹窗压在画布上）；放不下则放右侧；再不行则贴边
      let left = rect.left - boxW - 12;
      if (left < 8) {
        const right = rect.right + 12;
        left = right + boxW <= vw - 8 ? right : Math.max(8, vw - boxW - 8);
      }
      let top = rect.top + rect.height / 2 - boxH / 2;
      top = Math.max(8, Math.min(top, vh - boxH - 8));

      setData({ left, top, svg: clone });
      setVisible(true);
    };

    document.addEventListener("pointerover", onPointerOver);
    return () => {
      document.removeEventListener("pointerover", onPointerOver);
      cancelHide();
    };
  }, []);

  if (!visible || !data) return null;

  return (
    <div
      ref={popupRef}
      className="ctl-preview-popup"
      style={{ left: data.left, top: data.top }}
      // 阻止冒泡到 Excalidraw 的"点击空白处关闭库面板"处理器：在弹窗上操作不应关掉浮动库面板
      onMouseDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onMouseEnter={() => {
        if (hideTimer.current != null) {
          window.clearTimeout(hideTimer.current);
          hideTimer.current = null;
        }
      }}
      onMouseLeave={() => {
        if (!pinnedRef.current) setVisible(false);
      }}
    >
      <div className="ctl-preview-head">
        <span>控件预览</span>
        <span>
          <button
            className={pinned ? "pinned" : ""}
            title={pinned ? "取消固定" : "固定"}
            onClick={() => setPinned((p) => !p)}
          >
            📌
          </button>
          <button
            title="关闭"
            onClick={() => {
              setPinned(false);
              setVisible(false);
            }}
          >
            ✕
          </button>
        </span>
      </div>
      <div className="ctl-preview-body" ref={bodyRef} />
    </div>
  );
}
