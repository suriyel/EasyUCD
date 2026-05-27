// 右侧预览的「手动编辑」持久化。仿 customControls.ts 的 localStorage 范式。
// 存的是序列化后的整份 HTML 字符串（已清理编辑残留），刷新/重开浏览器能恢复到右侧预览。
// edited 标志供 App「重新生成时提示覆盖」判断；clear 在生成新结果或用户确认覆盖后调用。

const KEY = "easyucd.previewEdit.v1";

export type PreviewEdit = { html: string; edited: boolean; savedAt: number };

export function loadPreviewEdit(): PreviewEdit | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PreviewEdit;
    return data && typeof data.html === "string" ? data : null;
  } catch (e) {
    console.warn("读取预览编辑失败：", e);
    return null;
  }
}

export function savePreviewEdit(html: string) {
  try {
    localStorage.setItem(
      KEY,
      JSON.stringify({ html, edited: true, savedAt: Date.now() } satisfies PreviewEdit),
    );
  } catch (e) {
    // 大页面可能超出 localStorage 容量（~5MB），吞掉不阻断编辑。
    console.warn("保存预览编辑失败（可能超出 localStorage 容量）：", e);
  }
}

export function clearPreviewEdit() {
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    console.warn("清除预览编辑失败：", e);
  }
}
