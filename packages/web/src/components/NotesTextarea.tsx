type Props = { value: string; onChange: (v: string) => void };

export default function NotesTextarea({ value, onChange }: Props) {
  return (
    <div className="notes-wrap">
      <label htmlFor="notes">文字补充（可选，用于描述交互/约束）</label>
      <textarea
        id="notes"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="例如：登录按钮在两个输入框非空时才可用"
      />
    </div>
  );
}
