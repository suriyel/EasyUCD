import type { Health } from "../api";

type Props = {
  health: Health | null;
  cli: string;
  onChange: (cli: string) => void;
};

const FALLBACK: { name: string; available: boolean }[] = [
  { name: "claude", available: true },
  { name: "opencode", available: false },
];

export default function CliSelector({ health, cli, onChange }: Props) {
  const clis = health?.clis?.length ? health.clis : FALLBACK;
  const mock = health?.mock ?? false;

  return (
    <div className="cli-selector">
      <span>CLI</span>
      {clis.map((c) => {
        const disabled = !c.available && !mock;
        return (
          <button
            key={c.name}
            className={cli === c.name ? "active" : ""}
            disabled={disabled}
            data-unavailable={!c.available}
            title={c.available ? c.name : `${c.name} 不可用（未安装/未登录）`}
            onClick={() => onChange(c.name)}
          >
            {c.name}
          </button>
        );
      })}
      {mock && <span title="环境变量 WTH_MOCK=1：不会真正调用模型">· MOCK</span>}
    </div>
  );
}
