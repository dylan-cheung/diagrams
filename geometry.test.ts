import { describe, expect, test } from "bun:test";
import { assignParallelSlots, edgePath, parallelOffset, placeLabels, sideAnchor } from "./geometry.ts";
import { parsePropertyValue } from "./model.ts";

describe("geometry", () => {
  test("puts each label at a free place on its own edge", () => {
    const nodes = [{ x: 0, y: 0, width: 200, height: 60 }];
    const line = (x: number) => [0.5, 0.42, 0.58, 0.34, 0.66].map((t) => ({ x, y: 60 + 160 * t }));
    const labels = [80, 100, 120].map((x) => ({ id: String(x), candidates: line(x), width: 120, height: 18 }));
    const placed = placeLabels(labels, nodes);
    const points = labels.map(({ id }) => placed.get(id) ?? { x: 0, y: 0 });
    expect(points.map(({ x }) => x)).toEqual([80, 100, 120]);
    const ys = points.map(({ y }) => y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) expect((ys[i] ?? 0) - (ys[i - 1] ?? 0)).toBeGreaterThanOrEqual(18);
    for (const y of ys) expect(y - 9).toBeGreaterThanOrEqual(60);
  });

  test("anchors an edge at the center of the box side that faces the other node", () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    expect(sideAnchor(box, { x: 500, y: 200 })).toEqual({ x: 100, y: 25 });
    expect(sideAnchor(box, { x: -500, y: -100 })).toEqual({ x: 0, y: 25 });
    expect(sideAnchor(box, { x: 80, y: -500 })).toEqual({ x: 50, y: 0 });
    expect(sideAnchor(box, { x: 20, y: 500 })).toEqual({ x: 50, y: 50 });
  });

  test("groups parallel edges in both directions and loops", () => {
    const slots = assignParallelSlots([
      { id: "1", source: "a", target: "b" },
      { id: "2", source: "b", target: "a" },
      { id: "3", source: "a", target: "a" },
      { id: "4", source: "a", target: "c" },
    ]);
    expect(slots.get("1")).toEqual({ index: 0, count: 2 });
    expect(slots.get("2")).toEqual({ index: 1, count: 2 });
    expect(slots.get("3")).toEqual({ index: 0, count: 1 });
    expect(slots.get("4")).toEqual({ index: 0, count: 1 });
  });

  test("spreads parallel edges around the straight line", () => {
    expect([0, 1, 2].map((index) => parallelOffset({ index, count: 3 }))).toEqual([-36, 0, 36]);
    const a = { x: 0, y: 0, width: 100, height: 50 };
    const b = { x: 300, y: 0, width: 100, height: 50 };
    expect(edgePath(a, b, { index: 0, count: 1 }, false).path).toBe("M100 25 L300 25");
    const lower = { x: 300, y: 120, width: 100, height: 50 };
    expect(edgePath(a, lower, { index: 0, count: 1 }, false).path).toBe("M100 25 L300 145");
    expect(edgePath(a, b, { index: 0, count: 2 }, false).path).toStartWith("M");
    expect(edgePath(a, b, { index: 0, count: 2 }, false).path).toContain("Q");
  });

  test("parses property values typed in the editor", () => {
    expect(parsePropertyValue("42")).toBe(42);
    expect(parsePropertyValue("true")).toBe(true);
    expect(parsePropertyValue("null")).toBeNull();
    expect(parsePropertyValue("hello")).toBe("hello");
    expect(parsePropertyValue('{"a":1}')).toBe('{"a":1}');
  });
});
