// 模型资源配置弹窗（React 版 TechDemos profile picker）。
// 工具 Tab（Claude / OpenCode）+ 左列方案卡片 + 右列详情编辑 + 保存/激活/删除/新建。
// Claude 分 login（用已登录 claude，不注入 env）/ proxy（自定义端点 + 5 个模型槽）。

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getModels,
  getOpencodeModels,
  saveProfile,
  deleteProfile,
  setActiveProfile,
  LOGIN_PROFILE_ID,
  type ModelStore,
  type ToolName,
  type ClaudeProfile,
  type OpenCodeProfile,
} from "../api";

type Props = { onClose: () => void };
type Profile = ClaudeProfile | OpenCodeProfile;

// Claude proxy 的 5 个模型槽：[字段, 对应环境变量名（仅作标签提示）]
const MODEL_FIELDS: [keyof NonNullable<ClaudeProfile["models"]>, string][] = [
  ["primary", "ANTHROPIC_MODEL"],
  ["haiku", "DEFAULT_HAIKU_MODEL"],
  ["sonnet", "DEFAULT_SONNET_MODEL"],
  ["opus", "DEFAULT_OPUS_MODEL"],
  ["reasoning", "REASONING_MODEL"],
];

function slugId(name: string): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "p";
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

export default function ModelConfig({ onClose }: Props) {
  const [store, setStore] = useState<ModelStore | null>(null);
  const [tool, setTool] = useState<ToolName>("claude");
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [ocModels, setOcModels] = useState<string[]>([]);
  const [msg, setMsg] = useState<{ text: string; kind: "ok" | "err" } | null>(null);
  const [busy, setBusy] = useState(false);
  const msgTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const slot = store?.[tool] ?? { active: "", profiles: [] };
  const selected = slot.profiles.find((p) => p.id === selectedId) ?? null;

  const flash = useCallback((text: string, kind: "ok" | "err") => {
    setMsg({ text, kind });
    if (msgTimer.current) clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setMsg(null), 2500);
  }, []);

  // 初次加载：方案 store + opencode 模型列表
  useEffect(() => {
    getModels()
      .then((s) => {
        setStore(s);
        const cur = s.claude;
        setSelectedId(cur.active || cur.profiles[0]?.id || "");
      })
      .catch(() => flash("加载方案失败", "err"));
    getOpencodeModels()
      .then((d) => setOcModels(d.models || []))
      .catch(() => setOcModels([]));
  }, [flash]);

  // 选中项 / 工具切换时，把草稿重置为该方案的拷贝
  useEffect(() => {
    setDraft(selected ? (structuredClone(selected) as Profile) : null);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, selectedId, store]);

  const confirmDiscard = useCallback(() => {
    if (!dirty) return true;
    return window.confirm("当前编辑未保存，继续将丢弃改动。确定？");
  }, [dirty]);

  const switchTool = (t: ToolName) => {
    if (t === tool || !store) return;
    if (!confirmDiscard()) return;
    setTool(t);
    const s = store[t];
    setSelectedId(s.active || s.profiles[0]?.id || "");
  };

  const selectProfile = (id: string) => {
    if (id === selectedId) return;
    if (!confirmDiscard()) return;
    setSelectedId(id);
  };

  const setField = (patch: Partial<ClaudeProfile & OpenCodeProfile>) => {
    setDraft((d) => (d ? ({ ...d, ...patch } as Profile) : d));
    setDirty(true);
  };

  const setModelField = (key: string, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      const c = d as ClaudeProfile;
      return { ...c, models: { ...(c.models ?? {}), [key]: value } } as Profile;
    });
    setDirty(true);
  };

  const reload = useCallback(async () => {
    const s = await getModels();
    setStore(s);
    return s;
  }, []);

  const onSave = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      await saveProfile(tool, draft.id, draft);
      await reload();
      setDirty(false);
      flash("已保存", "ok");
    } catch (e) {
      flash((e as Error).message || "保存失败", "err");
    } finally {
      setBusy(false);
    }
  };

  const onActivate = async () => {
    if (!selected) return;
    if (!confirmDiscard()) return;
    setBusy(true);
    try {
      await setActiveProfile(tool, selected.id);
      await reload();
      flash("已设为激活", "ok");
    } catch (e) {
      flash((e as Error).message || "激活失败", "err");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    if (!window.confirm(`确定删除方案「${selected.name || selected.id}」？`)) return;
    setBusy(true);
    try {
      const r = await deleteProfile(tool, selected.id);
      setStore(r.store);
      const s = r.store[tool];
      setSelectedId(s.active || s.profiles[0]?.id || "");
      flash("已删除", "ok");
    } catch (e) {
      flash((e as Error).message || "删除失败", "err");
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async () => {
    if (!confirmDiscard()) return;
    const name = window.prompt("方案名称：");
    if (!name) return;
    const id = slugId(name);
    const body: Profile =
      tool === "claude"
        ? {
            id,
            name,
            kind: "proxy",
            baseUrl: "https://api.minimaxi.com/anthropic",
            authToken: "",
            models: {
              primary: "MiniMax-M2.7",
              haiku: "MiniMax-M2.7-highspeed",
              sonnet: "MiniMax-M2.7-highspeed",
              opus: "MiniMax-M2.7-highspeed",
              reasoning: "MiniMax-M2.7-highspeed",
            },
          }
        : { id, name, model: ocModels[0] || "" };
    setBusy(true);
    try {
      const r = await saveProfile(tool, id, body);
      setStore(r.store);
      setSelectedId(id);
      flash("已创建", "ok");
    } catch (e) {
      flash((e as Error).message || "创建失败", "err");
    } finally {
      setBusy(false);
    }
  };

  const requestClose = () => {
    if (!confirmDiscard()) return;
    onClose();
  };

  const claudeDraft = draft as ClaudeProfile | null;
  const ocDraft = draft as OpenCodeProfile | null;
  const isLogin = tool === "claude" && claudeDraft?.kind === "login";
  const canDelete =
    !!selected && selected.id !== (tool === "claude" ? LOGIN_PROFILE_ID : "__none__") && slot.active !== selected.id;

  return (
    <div className="modal-overlay" onClick={requestClose}>
      <div className="modal model-config" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>模型资源配置</h2>
          <button className="modal-close" title="关闭" onClick={requestClose}>
            ✕
          </button>
        </div>

        <div className="model-tabs">
          <button className={tool === "claude" ? "active" : ""} onClick={() => switchTool("claude")}>
            Claude
          </button>
          <button
            className={tool === "opencode" ? "active" : ""}
            onClick={() => switchTool("opencode")}
          >
            OpenCode
          </button>
          {msg && <span className={`model-msg ${msg.kind}`}>{msg.text}</span>}
        </div>

        <div className="model-body">
          {/* 左列：方案列表 */}
          <div className="profile-list">
            <div className="profile-list-head">
              <span>方案（{slot.profiles.length}）</span>
              <button className="link-add" onClick={onCreate} disabled={busy}>
                + 新建
              </button>
            </div>
            {slot.profiles.map((p) => {
              const meta =
                tool === "claude"
                  ? (p as ClaudeProfile).kind === "login"
                    ? "login (anthropic)"
                    : (p as ClaudeProfile).baseUrl || "(proxy)"
                  : (p as OpenCodeProfile).model || "—";
              return (
                <div
                  key={p.id}
                  className={`profile-card${p.id === selectedId ? " selected" : ""}${
                    slot.active === p.id ? " active" : ""
                  }`}
                  onClick={() => selectProfile(p.id)}
                  onDoubleClick={() => {
                    if (slot.active !== p.id) {
                      setSelectedId(p.id);
                      void onActivate();
                    }
                  }}
                >
                  <div className="av">
                    {(p.name || p.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 2).toUpperCase() || "?"}
                  </div>
                  <div className="pmeta">
                    <div className="pname">
                      {p.name || p.id}
                      {slot.active === p.id && <span className="badge-active">ACTIVE</span>}
                    </div>
                    <div className="psub">{meta}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* 右列：详情编辑 */}
          <div className="profile-detail">
            {!draft ? (
              <div className="detail-empty">请从左侧选择一个方案，或新建一个。</div>
            ) : (
              <>
                <label className="row">
                  <span>名称</span>
                  <input
                    value={draft.name}
                    placeholder="方案名称"
                    onChange={(e) => setField({ name: e.target.value })}
                  />
                </label>

                {tool === "claude" && isLogin && (
                  <div className="login-note">
                    该方案使用 Anthropic 官方端点，不注入任何 ANTHROPIC_* 环境变量。请先在终端运行{" "}
                    <code>claude</code> 登录（凭据写入 <code>~/.claude</code>）。
                  </div>
                )}

                {tool === "claude" && !isLogin && claudeDraft && (
                  <>
                    <label className="row">
                      <span>Base URL</span>
                      <input
                        value={claudeDraft.baseUrl ?? ""}
                        placeholder="https://api.minimaxi.com/anthropic"
                        onChange={(e) => setField({ baseUrl: e.target.value })}
                      />
                    </label>
                    <label className="row">
                      <span>Auth Token</span>
                      <input
                        type="password"
                        value={claudeDraft.authToken ?? ""}
                        placeholder="<your token>"
                        onChange={(e) => setField({ authToken: e.target.value })}
                      />
                    </label>
                    <div className="row">
                      <span>模型</span>
                      <div className="models-grid">
                        {MODEL_FIELDS.map(([key, label]) => (
                          <label key={key} className="model-slot">
                            <span title={`ANTHROPIC_${label}`}>{label}</span>
                            <input
                              value={claudeDraft.models?.[key] ?? ""}
                              placeholder="MiniMax-M2.7-highspeed"
                              onChange={(e) => setModelField(key, e.target.value)}
                            />
                          </label>
                        ))}
                      </div>
                    </div>
                  </>
                )}

                {tool === "opencode" && ocDraft && (
                  <>
                    <label className="row">
                      <span>Model（已认证可用）</span>
                      <select
                        value={ocModels.includes(ocDraft.model) ? ocDraft.model : ""}
                        onChange={(e) => setField({ model: e.target.value })}
                      >
                        <option value="" disabled>
                          {ocModels.length
                            ? "选择一个已认证模型…"
                            : "（无已认证模型，请先 opencode auth login）"}
                        </option>
                        {ocModels.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="row">
                      <span>或手动填写 provider/model</span>
                      <input
                        value={ocDraft.model ?? ""}
                        placeholder="provider/model"
                        onChange={(e) => setField({ model: e.target.value })}
                      />
                    </label>
                    <div className="login-note">
                      启动命令：<code>opencode run --model {ocDraft.model || "<model>"} …</code>
                      列表来自 <code>opencode models</code>（仅已认证 provider）。
                    </div>
                  </>
                )}

                <div className="detail-actions">
                  <button className="btn-primary" onClick={onSave} disabled={!dirty || busy}>
                    保存
                  </button>
                  <button
                    onClick={onActivate}
                    disabled={busy || !selected || slot.active === selected.id}
                  >
                    设为激活
                  </button>
                  <button className="btn-danger" onClick={onDelete} disabled={busy || !canDelete}>
                    删除
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
