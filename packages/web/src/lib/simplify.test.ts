import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { simplify, type RawElement } from "./simplify.ts";

// 读取生成的控件库，按名取某库项的元素，用于验证「精绘控件 → simplify」的边界契约。
const libPath = join(dirname(fileURLToPath(import.meta.url)), "../../public/wireframe-controls.excalidrawlib");
const lib = JSON.parse(readFileSync(libPath, "utf8")) as {
  libraryItems: { name: string; elements: RawElement[] }[];
};
function itemElements(name: string): RawElement[] {
  const it = lib.libraryItems.find((i) => i.name === name);
  if (!it) throw new Error(`库项不存在: ${name}`);
  return it.elements;
}

test("合并同组的 矩形+文字 为一个控件，类型取 controlType，文字合并", () => {
  const raw: RawElement[] = [
    {
      id: "r1",
      type: "rectangle",
      x: 10.4,
      y: 20.6,
      width: 120,
      height: 40,
      groupIds: ["grp-button"],
      customData: { controlType: "Button" },
    },
    {
      id: "t1",
      type: "text",
      x: 30,
      y: 32,
      width: 60,
      height: 20,
      text: "登录",
      groupIds: ["grp-button"],
      customData: { controlType: "Button" },
    },
  ];
  const { elements } = simplify(raw);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].type, "Button");
  assert.equal(elements[0].text, "登录");
  // 坐标取整，以矩形为几何边界
  assert.deepEqual(
    { x: elements[0].x, y: elements[0].y, w: elements[0].w, h: elements[0].h },
    { x: 10, y: 21, w: 120, h: 40 },
  );
});

test("过滤已删除元素", () => {
  const raw: RawElement[] = [
    { id: "a", type: "rectangle", x: 0, y: 0, width: 10, height: 10, isDeleted: true },
    { id: "b", type: "rectangle", x: 0, y: 0, width: 10, height: 10 },
  ];
  const { elements } = simplify(raw);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].id, "b");
});

test("无 groupIds 的元素各自成组，几何类型回退到 element.type", () => {
  const raw: RawElement[] = [
    { id: "x", type: "ellipse", x: 1, y: 2, width: 30, height: 30 },
  ];
  const { elements } = simplify(raw);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].type, "ellipse");
  assert.equal(elements[0].text, undefined);
});

test("绑定文字的 containerId 映射为 parent", () => {
  const raw: RawElement[] = [
    {
      id: "rect",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      containerId: "form-1",
      customData: { controlType: "Input" },
    },
  ];
  const { elements } = simplify(raw);
  assert.equal(elements[0].parent, "form-1");
});

test("notes 透传，缺省为空串", () => {
  assert.equal(simplify([], "按钮置灰").notes, "按钮置灰");
  assert.equal(simplify([]).notes, "");
});

test("空白文字不计入 text", () => {
  const raw: RawElement[] = [
    { id: "r", type: "rectangle", x: 0, y: 0, width: 10, height: 10, groupIds: ["g"] },
    { id: "t", type: "text", x: 0, y: 0, width: 10, height: 10, text: "   ", groupIds: ["g"] },
  ];
  const { elements } = simplify(raw);
  assert.equal(elements.length, 1);
  assert.equal(elements[0].text, undefined);
});

// —— 精绘控件边界契约：多图元控件经 simplify 后须取「外框」边界，而非内部装饰图元 ——
test("精绘控件 simplify 取外框边界、控件类型与主标签（Pagination/Checkbox/Transfer）", () => {
  const cases: ReadonlyArray<readonly [string, string, number, number, string]> = [
    // [库项名, 期望 type, 外框 w, 外框 h, 主标签]
    ["Pagination", "Pagination", 240, 32, "1"], // 外框须胜过内部 24×24 小格
    ["Checkbox", "Checkbox", 160, 24, "Checkbox"], // 外框须胜过内部 16×16 勾选框
    ["Transfer", "Transfer", 320, 180, "Source"], // 外框须胜过左右两内列表框
  ];
  for (const [name, type, w, h, text] of cases) {
    const { elements } = simplify(itemElements(name));
    assert.equal(elements.length, 1, `${name} 应合并为 1 个逻辑控件`);
    assert.equal(elements[0].type, type, `${name} 类型应取 controlType`);
    assert.equal(elements[0].w, w, `${name} 宽应为外框`);
    assert.equal(elements[0].h, h, `${name} 高应为外框`);
    assert.equal(elements[0].text, text, `${name} 文字应为主标签`);
  }
});

test("纯椭圆控件 simplify 回退 group[0] 作边界（Avatar）", () => {
  const { elements } = simplify(itemElements("Avatar"));
  assert.equal(elements.length, 1);
  assert.equal(elements[0].type, "Avatar");
  assert.equal(elements[0].w, 48);
  assert.equal(elements[0].h, 48);
  assert.equal(elements[0].text, "A");
});
