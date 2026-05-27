import { useEffect, useRef, useState } from "react";
import ExcalidrawCanvas, { type ExcalidrawAPI } from "./components/ExcalidrawCanvas";
import NotesTextarea from "./components/NotesTextarea";
import TextToWireframe from "./components/TextToWireframe";
import CliSelector from "./components/CliSelector";
import ModelConfig from "./components/ModelConfig";
import PreviewEditor from "./components/PreviewEditor";
import StatusBar, { type Status } from "./components/StatusBar";
import { simplify, type RawElement } from "./lib/simplify";
import { ApiError, generate, getHealth, type Health } from "./api";

type Recent = { cli: string; status: "done" | "error"; elapsedMs?: number };

export default function App() {
  const apiRef = useRef<ExcalidrawAPI | null>(null);
  // 右侧预览是否被手动编辑过（由 PreviewEditor 上报），用于「重新生成时提示覆盖」。
  const editedRef = useRef(false);
  const [notes, setNotes] = useState("");
  const [cli, setCli] = useState("claude");
  const [health, setHealth] = useState<Health | null>(null);
  const [showModelConfig, setShowModelConfig] = useState(false);
  const [maximized, setMaximized] = useState<null | "left" | "right">(null);
  const toggleMax = (which: "left" | "right") =>
    setMaximized((m) => (m === which ? null : which));

  const [status, setStatus] = useState<Status>("idle");
  const [html, setHtml] = useState("");
  const [warning, setWarning] = useState<string | undefined>();
  const [errorMsg, setErrorMsg] = useState<string | undefined>();
  const [info, setInfo] = useState<{ elapsedMs: number; tokensUsed: number } | undefined>();
  const [recent, setRecent] = useState<Recent[]>([]);

  // 启动时探测可用 CLI，选择默认/可用项（弹窗关闭后也复用以刷新状态）
  const refreshHealth = (pickCli = true) => {
    getHealth()
      .then((h) => {
        setHealth(h);
        if (!pickCli) return;
        const avail = h.clis.filter((c) => c.available).map((c) => c.name);
        if (h.defaultCli && (avail.includes(h.defaultCli) || h.mock)) setCli(h.defaultCli);
        else if (avail.length) setCli(avail[0]);
      })
      .catch(() => setHealth(null));
  };

  useEffect(() => {
    refreshHealth();
  }, []);

  // 最大化时按 Esc 退出（标题栏按钮始终可见，是主要退出入口）
  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [maximized]);

  const pushRecent = (r: Recent) => setRecent((prev) => [r, ...prev].slice(0, 5));

  // 文本→线框图：把后端生成的 Excalidraw 元素注入画板（替换当前场景）。
  const applyWireframe = (elements: unknown[]) => {
    apiRef.current?.updateScene({ elements });
  };

  const onGenerate = async () => {
    const api = apiRef.current;
    if (!api) return;
    const raw = api.getSceneElements() as unknown as RawElement[];
    const { elements, notes: cleanNotes } = simplify(raw, notes);

    if (elements.length === 0) {
      setStatus("error");
      setErrorMsg("画板为空，请先点击右侧控件库插入到画布。");
      return;
    }

    // 已对预览做过手动编辑时，重新生成会覆盖这些修改，先确认。
    if (
      editedRef.current &&
      !window.confirm("检测到你对预览做过手动编辑，重新生成将覆盖这些修改。是否继续？")
    ) {
      return;
    }

    setStatus("loading");
    setErrorMsg(undefined);
    setWarning(undefined);
    try {
      const res = await generate({ elements, notes: cleanNotes, cli });
      setHtml(res.html);
      setWarning(res.warning);
      setInfo({ elapsedMs: res.elapsedMs, tokensUsed: res.tokensUsed });
      setStatus("done");
      pushRecent({ cli, status: "done", elapsedMs: res.elapsedMs });
    } catch (e) {
      const msg =
        e instanceof ApiError
          ? `${e.message}${e.hint ? `\n提示：${e.hint}` : ""}`
          : String((e as Error)?.message ?? e);
      setErrorMsg(msg);
      setStatus("error");
      pushRecent({ cli, status: "error" });
    }
  };

  return (
    <div className="app">
      <div className={"pane left-pane" + (maximized === "left" ? " maximized" : "")}>
        <div className="pane-header">
          <h2>画板</h2>
          <div className="header-controls">
            <span style={{ color: "#888" }}>点击右侧控件库插入到画布</span>
            <button className="fullscreen-btn" onClick={() => toggleMax("left")}>
              {maximized === "left" ? "🗗 退出全屏" : "⛶ 全屏"}
            </button>
          </div>
        </div>
        <div className="canvas-wrap">
          <ExcalidrawCanvas
            onApi={(a) => {
              apiRef.current = a;
              // 调试/测试用逃生舱：暴露 Excalidraw API，便于脚本化注入场景
              (window as unknown as { __wthApi?: ExcalidrawAPI }).__wthApi = a;
            }}
          />
        </div>
        <TextToWireframe cli={cli} onApply={applyWireframe} />
        <NotesTextarea value={notes} onChange={setNotes} />
        <div className="actions-bar">
          <button className="generate-btn" disabled={status === "loading"} onClick={onGenerate}>
            {status === "loading" ? "生成中…" : "生成 HTML"}
          </button>
        </div>
      </div>

      <div className={"pane right-pane" + (maximized === "right" ? " maximized" : "")}>
        <div className="pane-header">
          <h2>HTML 预览</h2>
          <div className="header-controls">
            <CliSelector health={health} cli={cli} onChange={setCli} />
            <button className="model-config-btn" onClick={() => setShowModelConfig(true)}>
              ⚙ 模型配置
            </button>
            <button className="fullscreen-btn" onClick={() => toggleMax("right")}>
              {maximized === "right" ? "🗗 退出全屏" : "⛶ 全屏"}
            </button>
          </div>
        </div>
        <PreviewEditor
          generatedHtml={html}
          warning={warning}
          onEditedChange={(e) => {
            editedRef.current = e;
          }}
        />
        <StatusBar status={status} info={info} error={errorMsg} />
      </div>

      {showModelConfig && (
        <ModelConfig
          onClose={() => {
            setShowModelConfig(false);
            refreshHealth(false);
          }}
        />
      )}

      {recent.length > 0 && (
        <div className="recent-float">
          <h3>最近 {recent.length} 次生成</h3>
          <ul>
            {recent.map((r, i) => (
              <li key={i}>
                <span>
                  {r.cli} · {r.status === "done" ? "✓ 完成" : "✗ 失败"}
                </span>
                <span>{r.elapsedMs != null ? `${r.elapsedMs} ms` : "—"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
