import { useState } from "react";
import { ApiError, generateWireframe } from "../api";

type Props = {
  cli: string;
  /** 拿到生成的 Excalidraw 元素后注入画板（App 里接 updateScene） */
  onApply: (elements: unknown[]) => void;
};

/**
 * 「文字 → 线框图」输入区：输入一段描述，调后端生成 Excalidraw 元素并注入左侧画板。
 * 与 /api/generate（画板→HTML）对称，是反方向入口。
 */
export default function TextToWireframe({ cli, onApply }: Props) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [hint, setHint] = useState<string | undefined>();

  const run = async () => {
    const desc = text.trim();
    if (!desc) {
      setError("请先输入文字描述");
      return;
    }
    setLoading(true);
    setError(undefined);
    setHint(undefined);
    try {
      const res = await generateWireframe({ text: desc, cli });
      onApply(res.elements);
      setHint(`已生成 ${res.count} 个控件并注入画板${res.warning ? `（${res.warning}）` : ""}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? `${e.message}${e.hint ? `\n提示：${e.hint}` : ""}`
          : String((e as Error)?.message ?? e),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="t2w-wrap">
      <label htmlFor="t2w-input">文字生成线框图（会替换画板内容）</label>
      <textarea
        id="t2w-input"
        value={text}
        placeholder="用一句话描述要画的页面，例如：一个登录页，含标题、用户名、密码、登录按钮"
        onChange={(e) => setText(e.target.value)}
      />
      <div className="t2w-actions">
        <button className="generate-btn" disabled={loading} onClick={run}>
          {loading ? "生成中…" : "生成线框图"}
        </button>
        {hint && <span className="t2w-hint">{hint}</span>}
      </div>
      {error && <div className="t2w-error">{error}</div>}
    </div>
  );
}
