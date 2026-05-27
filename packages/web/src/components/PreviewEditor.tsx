// 右栏主体：HTML 预览 + 可视化编辑。取代原只读 PreviewIframe。
//
// 核心不变量（见 plan）：baseHtml（srcDoc 挂载源）只在「生成成功 / 从 localStorage 恢复 /
// 手动刷新」三个时机变并触发 iframe remount；编辑期间只直接 mutate iframe 的 live DOM，
// debounce 把 documentElement.outerHTML 序列化进 currentHtmlRef（供下载/复制/持久化），
// 绝不回写 baseHtml，故 iframe 永不重挂载，选中态/contentEditable 焦点不丢。
//
// 因 srcDoc + sandbox="allow-same-origin"（无 allow-scripts），父级可直接读写 contentDocument，
// 编辑器全部在父级实现，不注入脚本、不用 postMessage；iframe 内脚本本就不执行。

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import SelectionOverlay, { type HandleDir } from "./SelectionOverlay";
import StylePanel from "./StylePanel";
import {
  ensureEid,
  getTranslate,
  readStyleModel,
  rectInParent,
  serializeDoc,
  setTranslate,
  writeStyle,
  type Rect,
  type StyleModel,
  type StylePatch,
} from "../lib/domEdit";
import { clearPreviewEdit, loadPreviewEdit, savePreviewEdit } from "../lib/previewStore";

type Props = {
  generatedHtml: string;
  warning?: string;
  onEditedChange?: (edited: boolean) => void;
};

type DragState = {
  mode: "move" | "resize";
  dir: HandleDir | null;
  downX: number;
  downY: number;
  baseTx: number;
  baseTy: number;
  startW: number;
  startH: number;
  changed: boolean;
};

// 拖拽阈值（px）：按下后位移未超过它视为「点击」（仅选中，不移动）；超过才开始拖拽移动。
const DRAG_THRESHOLD = 5;

export default function PreviewEditor({ generatedHtml, warning, onEditedChange }: Props) {
  const [baseHtml, setBaseHtml] = useState("");
  const [baseKey, setBaseKey] = useState(0);
  const [loadTick, setLoadTick] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [styleModel, setStyleModel] = useState<StyleModel | null>(null);
  const [overlayRect, setOverlayRect] = useState<Rect | null>(null);
  const [copied, setCopied] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const currentHtmlRef = useRef("");
  const selectedElRef = useRef<HTMLElement | null>(null);
  const editedRef = useRef(false);
  const dragStateRef = useRef<DragState | null>(null);
  const serializeTimer = useRef<number | undefined>(undefined);
  const didInit = useRef(false);

  const has = baseHtml.length > 0;

  const bumpBase = (html: string) => {
    setBaseHtml(html);
    setBaseKey((k) => k + 1);
    currentHtmlRef.current = html;
  };

  const markEdited = () => {
    if (!editedRef.current) {
      editedRef.current = true;
      onEditedChange?.(true);
    }
  };

  const flushSerialize = () => {
    window.clearTimeout(serializeTimer.current);
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const html = serializeDoc(doc);
    currentHtmlRef.current = html;
    savePreviewEdit(html);
  };

  const scheduleSerialize = () => {
    window.clearTimeout(serializeTimer.current);
    serializeTimer.current = window.setTimeout(flushSerialize, 400);
  };

  const recomputeOverlay = () => {
    const el = selectedElRef.current;
    const iframe = iframeRef.current;
    const wrap = wrapRef.current;
    if (!el || !iframe || !wrap || !el.isConnected) {
      setOverlayRect(null);
      return;
    }
    setOverlayRect(rectInParent(el, iframe, wrap));
  };

  const selectEl = (el: HTMLElement) => {
    ensureEid(el);
    selectedElRef.current = el;
    setSelectedKey(el.getAttribute("data-ucd-id"));
    setStyleModel(readStyleModel(el));
    recomputeOverlay();
  };

  const deselect = () => {
    selectedElRef.current = null;
    setSelectedKey(null);
    setStyleModel(null);
    setOverlayRect(null);
  };

  const applyPatch = (patch: StylePatch) => {
    const el = selectedElRef.current;
    if (!el) return;
    writeStyle(el, patch);
    setStyleModel(readStyleModel(el));
    recomputeOverlay();
    markEdited();
    scheduleSerialize();
  };

  // ---- iframe 内/窗口 的事件处理（通过 cbRef 让监听稳定却始终读到最新闭包）----

  const onDocPointerDown = (e: PointerEvent) => {
    const el = e.target as HTMLElement | null;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    if (!el || !iframe || !doc) return;
    if (el.isContentEditable) return; // 正在就地改字，交给原生光标定位
    if (el === doc.documentElement || el === doc.body) {
      deselect();
      return;
    }
    selectEl(el);
    const f = iframe.getBoundingClientRect();
    const t = getTranslate(el);
    // iframe 内 pointerdown 的 clientX/Y 相对 iframe 视口，换算到顶层视口，
    // 以便和 window 上的 pointermove（顶层视口坐标）做差值。
    dragStateRef.current = {
      mode: "move",
      dir: null,
      downX: e.clientX + f.left,
      downY: e.clientY + f.top,
      baseTx: t.x,
      baseTy: t.y,
      startW: 0,
      startH: 0,
      changed: false,
    };
    wrapRef.current?.classList.add("dragging");
  };

  const onDocClick = (e: MouseEvent) => {
    // 编辑模式下拦截链接跳转/表单提交（sandbox 无脚本但 <a> 仍可能导航）。
    const el = e.target as HTMLElement | null;
    if (el?.closest?.("a, button, input[type=submit]")) e.preventDefault();
  };

  const onDocDblClick = (e: MouseEvent) => {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    dragStateRef.current = null;
    wrapRef.current?.classList.remove("dragging");
    el.setAttribute("contenteditable", "true");
    el.classList.add("ucd-editing");
    el.focus();
    selectEl(el);
    const onBlur = () => {
      el.removeAttribute("contenteditable");
      el.classList.remove("ucd-editing");
      if (el.getAttribute("class") === "") el.removeAttribute("class");
      el.removeEventListener("blur", onBlur);
      markEdited();
      scheduleSerialize();
      setStyleModel(readStyleModel(el));
      recomputeOverlay();
    };
    el.addEventListener("blur", onBlur);
  };

  const onWinPointerMove = (e: PointerEvent) => {
    const ds = dragStateRef.current;
    const el = selectedElRef.current;
    if (!ds || !el) return;
    const dx = e.clientX - ds.downX;
    const dy = e.clientY - ds.downY;
    if (ds.mode === "move") {
      // 未越过拖拽阈值前只是「点击选中」，不移动元素；越过后才开始拖拽移动。
      if (!ds.changed && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      ds.changed = true;
      setTranslate(el, ds.baseTx + dx, ds.baseTy + dy);
    } else {
      const dir = ds.dir!;
      let w = ds.startW;
      let h = ds.startH;
      let tx = ds.baseTx;
      let ty = ds.baseTy;
      if (dir.includes("e")) w = ds.startW + dx;
      if (dir.includes("w")) {
        w = ds.startW - dx;
        tx = ds.baseTx + dx;
      }
      if (dir.includes("s")) h = ds.startH + dy;
      if (dir.includes("n")) {
        h = ds.startH - dy;
        ty = ds.baseTy + dy;
      }
      el.style.width = `${Math.max(8, Math.round(w))}px`;
      el.style.height = `${Math.max(8, Math.round(h))}px`;
      if (dir.includes("w") || dir.includes("n")) setTranslate(el, tx, ty);
      ds.changed = true;
    }
    recomputeOverlay();
  };

  const onWinPointerUp = () => {
    const ds = dragStateRef.current;
    dragStateRef.current = null;
    wrapRef.current?.classList.remove("dragging");
    if (!ds || !ds.changed) return;
    const el = selectedElRef.current;
    if (el) setStyleModel(readStyleModel(el));
    recomputeOverlay();
    markEdited();
    scheduleSerialize();
  };

  const onHandleDown = (dir: HandleDir, e: ReactPointerEvent) => {
    const el = selectedElRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const t = getTranslate(el);
    dragStateRef.current = {
      mode: "resize",
      dir,
      downX: e.clientX,
      downY: e.clientY,
      baseTx: t.x,
      baseTy: t.y,
      startW: rect.width,
      startH: rect.height,
      changed: false,
    };
    wrapRef.current?.classList.add("dragging");
  };

  // 把最新的处理函数放进 ref，使下面的监听 wrapper 稳定却总能读到最新闭包，
  // 避免随每次 setState 重新 attach（也就不会丢监听 / 指向旧 contentDocument）。
  const cb = {
    onDocPointerDown,
    onDocClick,
    onDocDblClick,
    onWinPointerMove,
    onWinPointerUp,
    recomputeOverlay,
    deselect,
  };
  const cbRef = useRef(cb);
  cbRef.current = cb;

  // 初始化 / 生成结果变化：决定 baseHtml。
  useEffect(() => {
    if (!didInit.current) {
      didInit.current = true;
      const saved = loadPreviewEdit();
      if (saved?.edited && saved.html) {
        bumpBase(saved.html); // 恢复上次手动编辑结果
        editedRef.current = true;
        onEditedChange?.(true);
      } else {
        bumpBase(generatedHtml);
      }
      return;
    }
    // 初始化之后 generatedHtml 变化 = 用户点了「生成 HTML」（App 已做过覆盖确认）。
    bumpBase(generatedHtml);
    editedRef.current = false;
    clearPreviewEdit();
    onEditedChange?.(false);
    deselect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatedHtml]);

  // 编辑模式开启时，对当前已加载的 contentDocument attach 监听；loadTick 覆盖 iframe 每次
  // remount/srcDoc 加载完成（含初始与重新生成），保证总是绑到最新文档。
  useEffect(() => {
    if (!editMode) return;
    const iframe = iframeRef.current;
    const doc = iframe?.contentDocument;
    const win = iframe?.contentWindow;
    if (!iframe || !doc || !win) return;

    const onPD = (e: Event) => cbRef.current.onDocPointerDown(e as PointerEvent);
    const onCL = (e: Event) => cbRef.current.onDocClick(e as MouseEvent);
    const onDC = (e: Event) => cbRef.current.onDocDblClick(e as MouseEvent);
    const onPM = (e: Event) => cbRef.current.onWinPointerMove(e as PointerEvent);
    const onPU = () => cbRef.current.onWinPointerUp();
    const onRC = () => cbRef.current.recomputeOverlay();

    doc.addEventListener("pointerdown", onPD, true);
    doc.addEventListener("click", onCL, true);
    doc.addEventListener("dblclick", onDC, true);
    win.addEventListener("scroll", onRC, true);
    window.addEventListener("pointermove", onPM);
    window.addEventListener("pointerup", onPU);
    window.addEventListener("resize", onRC);
    const ro = new ResizeObserver(onRC);
    if (wrapRef.current) ro.observe(wrapRef.current);
    cbRef.current.deselect(); // 新文档：旧选中元素已失效

    return () => {
      doc.removeEventListener("pointerdown", onPD, true);
      doc.removeEventListener("click", onCL, true);
      doc.removeEventListener("dblclick", onDC, true);
      win.removeEventListener("scroll", onRC, true);
      window.removeEventListener("pointermove", onPM);
      window.removeEventListener("pointerup", onPU);
      window.removeEventListener("resize", onRC);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, loadTick]);

  // ---- 工具条动作 ----

  const getCurrentHtml = () => {
    const doc = iframeRef.current?.contentDocument;
    if (editMode && doc) return serializeDoc(doc); // 含未 debounce 落盘的最新编辑
    return currentHtmlRef.current || baseHtml;
  };

  const download = () => {
    const blob = new Blob([getCurrentHtml()], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wireframe.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getCurrentHtml());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
    }
  };

  const refresh = () => {
    flushSerialize();
    bumpBase(getCurrentHtml()); // 从当前（含编辑）结果重挂载
    deselect();
  };

  const toggleEdit = () => {
    if (editMode) {
      flushSerialize();
      deselect();
      setEditMode(false);
    } else {
      setEditMode(true);
    }
  };

  return (
    <>
      <div className="actions-bar">
        <button disabled={!has} onClick={download}>
          下载 HTML
        </button>
        <button disabled={!has} onClick={copy}>
          复制源码
        </button>
        <button disabled={!has} onClick={refresh}>
          刷新预览
        </button>
        <button
          disabled={!has}
          className={editMode ? "edit-toggle on" : "edit-toggle"}
          onClick={toggleEdit}
        >
          {editMode ? "✓ 完成编辑" : "✎ 编辑"}
        </button>
        {copied && <span style={{ fontSize: 12, color: "#2f9e44" }}>已复制</span>}
        {editMode && (
          <span className="edit-hint">点选编辑 · 拖动移动 · 拖角缩放 · 双击改字</span>
        )}
      </div>
      {warning && <div className="warning-bar">⚠ {warning}</div>}
      <div className={"preview-stage" + (editMode ? " editing" : "")}>
        <div className="preview-wrap" ref={wrapRef}>
          {has ? (
            <iframe
              key={baseKey}
              ref={iframeRef}
              title="HTML 预览"
              sandbox="allow-same-origin"
              srcDoc={baseHtml}
              onLoad={() => setLoadTick((t) => t + 1)}
            />
          ) : (
            <div className="preview-empty">
              在左侧画板摆放控件、写文字补充后，
              <br />
              点击「生成 HTML」即可在此预览。
            </div>
          )}
          {editMode && has && (
            <SelectionOverlay rect={overlayRect} onHandleDown={onHandleDown} />
          )}
        </div>
        {editMode && has && (
          <StylePanel
            key={selectedKey ?? "none"}
            model={styleModel}
            onChange={applyPatch}
            onDeselect={deselect}
          />
        )}
      </div>
    </>
  );
}
