import { describe, expect, test } from "bun:test";
import { findCycleNodeId, layoutGraph, removeNode, validateGraph, type GraphNode } from "./graph.ts";

const node = (id: string, next: string | null = null, routes: GraphNode["routes"] = []): GraphNode => ({
  id,
  type: "step",
  label: id.toUpperCase(),
  next,
  routes,
});

const route = (key: string, target: string | null, stop = false) => ({ key, label: key, target, stop });

describe("validateGraph", () => {
  test("accepts a branching graph", () => {
    const nodes = [node("a", "b"), node("b", null, [route("yes", "c"), route("no", null, true)]), node("c")];
    expect(validateGraph({ name: "g", type: "directional", nodes })).toEqual([]);
  });

  test("rejects missing targets, bad keys and duplicate ids", () => {
    const nodes = [node("a", "x"), node("a"), node("b", null, [route("Bad Key", null), route("ok", "missing")])];
    const errors = validateGraph({ name: "g", type: "directional", nodes });
    expect(errors).toContain('Node "A" points to a missing node.');
    expect(errors).toContain("Node id a is used more than once.");
    expect(errors).toContain('A route on "B" needs a key of lowercase letters, digits and underscores.');
    expect(errors).toContain('Route ok on "B" points to a missing node.');
  });

  test("rejects a stop route that also has a target", () => {
    const nodes = [node("a", null, [route("done", "b", true)]), node("b")];
    expect(validateGraph({ name: "g", type: "t", nodes })).toEqual(['Route done on "A" cannot stop and have a target.']);
  });

  test("rejects cycles", () => {
    const nodes = [node("a", "b"), node("b", null, [route("back", "a")])];
    expect(validateGraph({ name: "g", type: "t", nodes })[0]).toMatch(/cycle/);
  });

  test("requires a name and a type", () => {
    expect(validateGraph({ name: " ", type: "", nodes: [] })).toEqual([
      "The graph needs a name.",
      "The graph needs a type.",
    ]);
  });
});

describe("findCycleNodeId", () => {
  test("returns null for a tree", () => {
    expect(findCycleNodeId([node("a", "b"), node("b")])).toBeNull();
  });
});

describe("layoutGraph", () => {
  test("places each node one column after its deepest parent", () => {
    const nodes = [node("a", "b", [route("skip", "c")]), node("b", "c"), node("c")];
    const positions = layoutGraph(nodes);
    expect(positions.get("a")).toEqual({ depth: 0, row: 0 });
    expect(positions.get("b")).toEqual({ depth: 1, row: 0 });
    expect(positions.get("c")).toEqual({ depth: 2, row: 0 });
  });

  test("stacks siblings in rows and survives a cycle", () => {
    const positions = layoutGraph([node("a", null, [route("x", "b"), route("y", "c")]), node("b", "a"), node("c")]);
    expect(positions.size).toBe(3);
    expect(positions.get("c")?.depth).toBe(positions.get("b")?.depth);
  });
});

describe("removeNode", () => {
  test("clears next and route targets that pointed to the removed node", () => {
    const nodes = removeNode([node("a", "b", [route("r", "b")]), node("b")], "b");
    expect(nodes).toEqual([node("a", null, [route("r", null)])]);
  });
});
