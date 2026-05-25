import { useState } from "react";

type Props = { html: string; warning?: string };

/**
 * 右栏 HTML 预览。iframe 用 sandbox="allow-same-origin" 禁止脚本执行（§4.6/§7.2）。
 * 提供 下载 / 复制源码 / 刷新预览 三个操作。
 */
export default function PreviewIframe({ html, warning }: Props) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const has = html.length > 0;

  const download = () => {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wireframe.html";
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(html);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* 剪贴板不可用时忽略 */
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
        <button disabled={!has} onClick={() => setRefreshKey((k) => k + 1)}>
          刷新预览
        </button>
        {copied && <span style={{ fontSize: 12, color: "#2f9e44" }}>已复制</span>}
      </div>
      {warning && <div className="warning-bar">⚠ {warning}</div>}
      <div className="preview-wrap">
        {has ? (
          <iframe
            key={refreshKey}
            title="HTML 预览"
            sandbox="allow-same-origin"
            srcDoc={html}
          />
        ) : (
          <div className="preview-empty">
            在左侧画板摆放控件、写文字补充后，
            <br />
            点击「生成 HTML」即可在此预览。
          </div>
        )}
      </div>
    </>
  );
}
