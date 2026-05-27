// 右侧固定属性面板（编辑模式下显示）。受控组件：展示当前选中元素的 StyleModel，
// 任意字段改动都通过 onChange(patch) 上抛，由 PreviewEditor 写回 iframe 的 inline style。
// 布局参考 .control-palette 固定栏（见 index.css 的 .style-panel）。

import type { StyleModel, StylePatch } from "../lib/domEdit";

type Props = {
  model: StyleModel | null;
  onChange: (patch: StylePatch) => void;
  onDeselect: () => void;
};

// 字体预设：尽量用通用栈，避免依赖特定字体安装。
const FONTS = [
  { label: "系统默认", value: "system-ui, -apple-system, sans-serif" },
  { label: "无衬线", value: "Arial, Helvetica, sans-serif" },
  { label: "衬线", value: "Georgia, 'Times New Roman', serif" },
  { label: "等宽", value: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

// 从 computed fontFamily 粗略归类到预设，作为 select 的当前值（匹配不上则显示「当前」）。
function fontPreset(ff: string): string {
  const f = ff.toLowerCase();
  if (f.includes("monospace")) return FONTS[3].value;
  if (f.includes("serif") && !f.includes("sans-serif")) return FONTS[2].value;
  if (f.includes("system-ui") || f.includes("-apple-system")) return FONTS[0].value;
  if (f.includes("sans-serif") || f.includes("arial") || f.includes("helvetica")) return FONTS[1].value;
  return "__current__";
}

export default function StylePanel({ model, onChange, onDeselect }: Props) {
  if (!model) {
    return (
      <div className="style-panel">
        <div className="style-empty">点选预览中的元素，在此编辑其文字与样式。</div>
      </div>
    );
  }

  const preset = fontPreset(model.fontFamily);

  // 边框三属性联动写入，保证设了宽度就能显示（避免原 style 为 none 时不可见）。
  const writeBorder = (p: Partial<Pick<StyleModel, "borderWidth" | "borderStyle" | "borderColor">>) =>
    onChange({
      borderWidth: p.borderWidth ?? model.borderWidth,
      borderStyle: p.borderStyle ?? model.borderStyle,
      borderColor: p.borderColor ?? model.borderColor,
    });

  return (
    <div className="style-panel">
      <div className="style-head">
        <span className="style-tag" title={model.tag}>
          {model.tag}
        </span>
        <button type="button" className="style-deselect" title="取消选中" onClick={onDeselect}>
          ×
        </button>
      </div>

      <div className="field">
        <span>文字内容</span>
        <textarea
          rows={2}
          value={model.text}
          disabled={!model.isTextLeaf}
          placeholder={model.isTextLeaf ? "" : "（含子元素，双击元素就地编辑）"}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </div>

      <div className="field">
        <span>文字颜色</span>
        <div className="color-row">
          <input
            type="color"
            value={model.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
          <input
            type="text"
            className="hex"
            value={model.color}
            onChange={(e) => onChange({ color: e.target.value })}
          />
        </div>
      </div>

      <div className="field">
        <span>背景色</span>
        <div className="color-row">
          <input
            type="color"
            value={model.background}
            disabled={model.bgTransparent}
            onChange={(e) => onChange({ background: e.target.value })}
          />
          <input
            type="text"
            className="hex"
            value={model.bgTransparent ? "transparent" : model.background}
            disabled={model.bgTransparent}
            onChange={(e) => onChange({ background: e.target.value })}
          />
          <label className="chk">
            <input
              type="checkbox"
              checked={model.bgTransparent}
              onChange={(e) => onChange({ background: e.target.checked ? "transparent" : model.background })}
            />
            透明
          </label>
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span>字号(px)</span>
          <input
            type="number"
            min={1}
            value={model.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>字体</span>
          <select
            value={preset}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
          >
            {preset === "__current__" && <option value="__current__">当前</option>}
            {FONTS.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field">
        <span>边框</span>
        <div className="border-row">
          <input
            type="number"
            min={0}
            title="宽度(px)"
            value={model.borderWidth}
            onChange={(e) => writeBorder({ borderWidth: Number(e.target.value) })}
          />
          <select
            title="线型"
            value={model.borderStyle}
            onChange={(e) => writeBorder({ borderStyle: e.target.value })}
          >
            <option value="solid">实线</option>
            <option value="dashed">虚线</option>
            <option value="dotted">点线</option>
            <option value="none">无</option>
          </select>
          <input
            type="color"
            title="颜色"
            value={model.borderColor}
            onChange={(e) => writeBorder({ borderColor: e.target.value })}
          />
        </div>
      </div>

      <div className="field-row">
        <label className="field">
          <span>圆角(px)</span>
          <input
            type="number"
            min={0}
            value={model.borderRadius}
            onChange={(e) => onChange({ borderRadius: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>内边距(px)</span>
          <input
            type="number"
            min={0}
            value={model.padding}
            onChange={(e) => onChange({ padding: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span>外边距(px)</span>
          <input
            type="number"
            min={0}
            value={model.margin}
            onChange={(e) => onChange({ margin: Number(e.target.value) })}
          />
        </label>
        <label className="field" />
      </div>

      <div className="field-row">
        <label className="field">
          <span>宽(px)</span>
          <input
            type="number"
            min={1}
            value={model.width}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
          />
        </label>
        <label className="field">
          <span>高(px)</span>
          <input
            type="number"
            min={1}
            value={model.height}
            onChange={(e) => onChange({ height: Number(e.target.value) })}
          />
        </label>
      </div>

      <div className="style-hint">提示：拖动元素为浮动定位，不影响其他元素排布。</div>
    </div>
  );
}
