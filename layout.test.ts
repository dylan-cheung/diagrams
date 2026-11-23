import { describe, expect, test } from "bun:test";
import { autoLayout, NODE_HEIGHT, NODE_WIDTH } from "./layout.ts";
import type { Position } from "./model.ts";

describe("auto layout", () => {
  test("places the nodes of a group together, and still routes every edge", async () => {
    const nodes = [
      { id: "a", position: null, groupId: "one" },
      { id: "b", position: null, groupId: "one" },
      { id: "c", position: null, groupId: "two" },
      { id: "d", position: null, groupId: "two" },
      { id: "e", position: null, groupId: null },
    ];
    const edges = [
      { id: "ac", source: "a", target: "c" },
      { id: "bd", source: "b", target: "d" },
      { id: "ce", source: "c", target: "e" },
      { id: "ad", source: "a", target: "d" },
    ];
    const { positions, routes } = await autoLayout(nodes, edges, false, "horizontal");
    expect(Object.keys(positions).sort()).toEqual(["a", "b", "c", "d", "e"]);
    expect(Object.keys(routes).sort()).toEqual(["ac", "ad", "bd", "ce"]);

    const box = (ids: string[]) => {
      const points = ids.map((id) => positions[id] as Position);
      return {
        left: Math.min(...points.map(({ x }) => x)),
        right: Math.max(...points.map(({ x }) => x + NODE_WIDTH)),
        top: Math.min(...points.map(({ y }) => y)),
        bottom: Math.max(...points.map(({ y }) => y + NODE_HEIGHT)),
      };
    };
    const inside = (id: string, around: ReturnType<typeof box>) => {
      const { x, y } = positions[id] as Position;
      return x < around.right && x + NODE_WIDTH > around.left && y < around.bottom && y + NODE_HEIGHT > around.top;
    };
    const one = box(["a", "b"]);
    const two = box(["c", "d"]);
    expect(["c", "d", "e"].some((id) => inside(id, one))).toBe(false);
    expect(["a", "b", "e"].some((id) => inside(id, two))).toBe(false);
  });
});
