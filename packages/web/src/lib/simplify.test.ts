import { test } from "node:test";
import assert from "node:assert/strict";
import { simplify, type RawElement } from "./simplify.ts";

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
