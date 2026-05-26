import { test } from "node:test";
import assert from "node:assert/strict";
import { cloneElementsForInsert } from "./cloneElements.ts";
import { simplify, type RawElement } from "./simplify.ts";

type TestEl = {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupIds: string[];
  containerId?: string | null;
  boundElements?: { type: string; id: string }[] | null;
  customData?: { controlType?: string } | null;
  [k: string]: unknown;
};

// 一个「两个子控件」的组合：
//   子控件 A = 矩形 rectA + 文字 textA（文字绑定到矩形），内层组 gA；
//   子控件 B = 矩形 rectB，内层组 gB；
//   三者再共享外层组 gO（模拟用户保存前 Ctrl+G）。
function composite(): TestEl[] {
  return [
    {
      id: "rectA", type: "rectangle", x: 100, y: 100, width: 120, height: 40,
      groupIds: ["gA", "gO"], customData: { controlType: "Card" },
      boundElements: [{ type: "text", id: "textA" }],
    },
    {
      id: "textA", type: "text", x: 110, y: 110, width: 80, height: 20,
      groupIds: ["gA", "gO"], customData: { controlType: "Card" },
      containerId: "rectA", text: "卡片",
    },
    {
      id: "rectB", type: "rectangle", x: 100, y: 160, width: 120, height: 40,
      groupIds: ["gB", "gO"], customData: { controlType: "Button" },
    },
  ];
}

test("保留分组结构：组合控件克隆后仍是 2 个不同的子组（不塌缩成一个）", () => {
  const out = cloneElementsForInsert(composite(), 0, 0);
  assert.equal(out.length, 3);
  // 按 groupIds[0]（内层组）去重 → 应为 2 个逻辑子组
  const inner = new Set(out.map((e) => e.groupIds[0]));
  assert.equal(inner.size, 2);
  // rectA / textA 同属一个内层组；rectB 属另一个
  assert.equal(out[0].groupIds[0], out[1].groupIds[0]);
  assert.notEqual(out[0].groupIds[0], out[2].groupIds[0]);
});

test("外层组在所有元素间一致重映射，且层级（数组长度/顺序）保留", () => {
  const out = cloneElementsForInsert(composite(), 0, 0);
  for (const e of out) assert.equal(e.groupIds.length, 2); // [内层, 外层] 两级保留
  const outer = new Set(out.map((e) => e.groupIds[1]));
  assert.equal(outer.size, 1); // 外层组三元素共享同一个新 id
});

test("id 与 groupIds 全部换新（与原件不同），不与原件串扰", () => {
  const src = composite();
  const out = cloneElementsForInsert(src, 0, 0);
  const oldIds = new Set(src.map((e) => e.id));
  const oldGroups = new Set(src.flatMap((e) => e.groupIds));
  for (const e of out) {
    assert.ok(!oldIds.has(e.id), `id 应换新: ${e.id}`);
    for (const g of e.groupIds) assert.ok(!oldGroups.has(g), `groupId 应换新: ${g}`);
  }
  // id 唯一
  assert.equal(new Set(out.map((e) => e.id)).size, 3);
});

test("绑定自洽：containerId / boundElements 指向新 id", () => {
  const out = cloneElementsForInsert(composite(), 0, 0);
  const [rectA, textA] = out;
  // 文字的 containerId 指向矩形的新 id
  assert.equal(textA.containerId, rectA.id);
  // 矩形的 boundElements 指向文字的新 id
  assert.equal(rectA.boundElements?.[0].id, textA.id);
});

test("整体平移 (dx, dy)", () => {
  const out = cloneElementsForInsert(composite(), 1000, 500);
  assert.equal(out[0].x, 1100);
  assert.equal(out[0].y, 600);
  assert.equal(out[2].y, 660);
});

test("两次克隆互不串扰（每次插入是独立实例）", () => {
  const a = cloneElementsForInsert(composite(), 0, 0);
  const b = cloneElementsForInsert(composite(), 0, 0);
  const ga = new Set(a.flatMap((e) => e.groupIds));
  const gb = new Set(b.flatMap((e) => e.groupIds));
  for (const g of gb) assert.ok(!ga.has(g), "两次插入的 groupId 不应重合");
  const ia = new Set(a.map((e) => e.id));
  for (const e of b) assert.ok(!ia.has(e.id), "两次插入的 id 不应重合");
});

test("simplify 在克隆结果上产出 2 个逻辑控件（旧拍平逻辑只会得 1 个）", () => {
  const out = cloneElementsForInsert(composite(), 0, 0);
  const { elements } = simplify(out as unknown as RawElement[]);
  assert.equal(elements.length, 2);
  const types = new Set(elements.map((e) => e.type));
  assert.ok(types.has("Card"));
  assert.ok(types.has("Button"));
});

test("单一控件（单组）克隆后仍合并为 1 个逻辑控件，无回归", () => {
  const single: TestEl[] = [
    { id: "r", type: "rectangle", x: 0, y: 0, width: 120, height: 40, groupIds: ["g1"], customData: { controlType: "Button" } },
    { id: "t", type: "text", x: 10, y: 10, width: 60, height: 20, groupIds: ["g1"], customData: { controlType: "Button" }, text: "OK" },
  ];
  const out = cloneElementsForInsert(single, 0, 0);
  assert.equal(new Set(out.map((e) => e.groupIds[0])).size, 1);
  const { elements } = simplify(out as unknown as RawElement[]);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].type, "Button");
});
