import { describe, expect, test } from "bun:test";
import { assignParallelSlots, boxBorderPoint, edgePath, parallelOffset } from "./geometry.ts";
import { parsePropertyValue } from "./model.ts";

describe("geometry", () => {
  test("finds where a line from the center leaves the box", () => {
    const box = { x: 0, y: 0, width: 100, height: 50 };
    expect(boxBorderPoint(box, { x: 500, y: 25 })).toEqual({ x: 100, y: 25 });
    expect(boxBorderPoint(box, { x: 50, y: -500 })).toEqual({ x: 50, y: 0 });
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
