export type Status = "idle" | "loading" | "done" | "error";

type Props = {
  status: Status;
  info?: { elapsedMs: number; tokensUsed: number };
  error?: string;
};

export default function StatusBar({ status, info, error }: Props) {
  let text: string;
  switch (status) {
    case "loading":
      text = "生成中…（通常 8–15 秒）";
      break;
    case "done":
      text = info
        ? `完成 · ${info.elapsedMs} ms · ${info.tokensUsed} tokens`
        : "完成";
      break;
    case "error":
      text = "出错";
      break;
    default:
      text = "就绪";
  }

  return (
    <>
      <div className={`statusbar ${status}`}>
        <span className="dot" />
        <span>{text}</span>
      </div>
      {status === "error" && error && <div className="error-banner">{error}</div>}
    </>
  );
}
