// 把一组 Excalidraw 元素克隆成「可独立插入画布的一份新实例」——镜像 Excalidraw 内部
// duplicateElements 的关键行为：重映射 id / groupIds（保留数组顺序与层级）/ containerId /
// boundElements / startBinding / endBinding / frameId，使新实例内部引用自洽且与原件、与彼此互不串扰。
//
// 为什么不直接把整组拍平成单一 groupId：simplify.ts 按 groupIds[0] 归并逻辑控件，拍平会把
// 一个「多控件组合」塌缩成单个逻辑控件，导致生成 HTML 退化。保留（重映射后的）分组结构后，
// 每个子控件各自成组，与「原生库插入 / 导出再导入」同构。
//
// 本文件刻意零依赖（不 import @excalidraw/excalidraw），以便在 node 的 tsx --test 下单测。

export type SceneEl = { x: number; y: number; [k: string]: unknown };

// 内部可写视图：仅声明我们会重映射的字段，便于类型安全地改写。
type MutableEl = {
  id?: unknown;
  x?: number;
  y?: number;
  groupIds?: string[];
  containerId?: string | null;
  boundElements?: { id: string; [k: string]: unknown }[] | null;
  startBinding?: { elementId?: string; [k: string]: unknown } | null;
  endBinding?: { elementId?: string; [k: string]: unknown } | null;
  frameId?: string | null;
  seed?: number;
  versionNonce?: number;
  [k: string]: unknown;
};

let _counter = 0;
function newId(): string {
  _counter = (_counter + 1) >>> 0;
  return `${Date.now().toString(36)}-${_counter.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * 克隆 elements 为一份全新实例并整体平移 (dx, dy)。
 * - id / groupIds / 各类引用全部换新；同一旧 id/groupId 在本批次内映射一致。
 * - 指向本批次外的引用（不在 idMap 中）保持原值（与 Excalidraw 一致）。
 */
export function cloneElementsForInsert<T extends SceneEl>(
  elements: readonly T[],
  dx = 0,
  dy = 0,
): T[] {
  const idMap = new Map<string, string>();
  const groupIdMap = new Map<string, string>();

  // 第一遍：为本批次每个元素分配新 id（供 containerId/boundElements 等引用回填）。
  for (const el of elements) {
    const id = (el as MutableEl).id;
    if (typeof id === "string") idMap.set(id, newId());
  }
  const remapId = (id: unknown): string | null =>
    typeof id === "string" ? idMap.get(id) ?? id : null;

  return elements.map((el) => {
    const c = structuredClone(el) as MutableEl;

    if (typeof c.id === "string") c.id = idMap.get(c.id) ?? c.id;

    if (Array.isArray(c.groupIds)) {
      c.groupIds = c.groupIds.map((g) => {
        if (!groupIdMap.has(g)) groupIdMap.set(g, newId());
        return groupIdMap.get(g)!;
      });
    }

    if (c.containerId != null) c.containerId = remapId(c.containerId);

    if (Array.isArray(c.boundElements)) {
      c.boundElements = c.boundElements.map((b) => ({ ...b, id: idMap.get(b.id) ?? b.id }));
    }

    if (c.startBinding && typeof c.startBinding.elementId === "string") {
      c.startBinding = {
        ...c.startBinding,
        elementId: idMap.get(c.startBinding.elementId) ?? c.startBinding.elementId,
      };
    }
    if (c.endBinding && typeof c.endBinding.elementId === "string") {
      c.endBinding = {
        ...c.endBinding,
        elementId: idMap.get(c.endBinding.elementId) ?? c.endBinding.elementId,
      };
    }

    if (c.frameId != null) c.frameId = remapId(c.frameId);

    c.seed = Math.floor(Math.random() * 2 ** 31);
    c.versionNonce = Math.floor(Math.random() * 2 ** 31);
    c.x = ((el as MutableEl).x ?? 0) + dx;
    c.y = ((el as MutableEl).y ?? 0) + dy;
    return c as unknown as T;
  });
}
