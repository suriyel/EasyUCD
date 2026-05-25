import { useEffect, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";

// 仅声明我们用到的 API 方法，避免耦合 Excalidraw 内部类型路径。
export type ExcalidrawAPI = {
  getSceneElements: () => readonly unknown[];
  updateScene: (scene: { elements?: unknown[] }) => void;
  updateLibrary: (opts: {
    libraryItems: unknown;
    merge?: boolean;
    defaultStatus?: "published" | "unpublished";
  }) => void;
};

type Props = { onApi: (api: ExcalidrawAPI) => void };

/**
 * 左栏画板。挂载后拉取内置控件库（.excalidrawlib）注入到 Excalidraw 的 Library 面板，
 * 用户即可从面板拖拽预设控件到画布。设计文档 §4.1.3。
 */
export default function ExcalidrawCanvas({ onApi }: Props) {
  const [api, setApi] = useState<ExcalidrawAPI | null>(null);

  useEffect(() => {
    if (!api) return;
    let cancelled = false;
    fetch("/wireframe-controls.excalidrawlib")
      .then((r) => r.json())
      .then((lib) => {
        if (cancelled) return;
        api.updateLibrary({
          libraryItems: lib.libraryItems,
          merge: true,
          defaultStatus: "published",
        });
      })
      .catch((e) => console.warn("加载控件库失败：", e));
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <Excalidraw
      excalidrawAPI={(a) => {
        const typed = a as unknown as ExcalidrawAPI;
        setApi(typed);
        onApi(typed);
      }}
    />
  );
}
