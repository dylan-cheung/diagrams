import { beforeEach, describe, expect, test } from "bun:test";
import { StoreError, openGraphStore, type GraphStore } from "./db.ts";

let store: GraphStore;

beforeEach(() => {
  store = openGraphStore(":memory:");
});

describe("nodes and edges", () => {
  test("allows parallel edges, loops, and both directions between the same nodes", () => {
    const a = store.createNode({ name: "A", labels: [" Person ", "Person", ""] });
    const b = store.createNode({ name: "B" });
    store.createEdge({ source: a.id, target: b.id, label: "knows" });
    store.createEdge({ source: a.id, target: b.id, label: "owes" });
    store.createEdge({ source: b.id, target: a.id });
    store.createEdge({ source: a.id, target: a.id, directed: false });
    expect(a.labels).toEqual(["Person"]);
    expect(store.listEdges().map(({ label, directed }) => [label, directed])).toEqual([
      ["knows", true],
      ["owes", true],
      ["", true],
      ["", false],
    ]);
  });

  test("deleting a node deletes its edges everywhere", () => {
    const a = store.createNode({ name: "A" });
    const b = store.createNode({ name: "B" });
    store.createEdge({ source: a.id, target: b.id });
    store.deleteNode(b.id);
    expect(store.listEdges()).toEqual([]);
  });

  test("rejects an edge to a missing node", () => {
    const a = store.createNode({ name: "A" });
    expect(() => store.createEdge({ source: a.id, target: "missing" })).toThrow(StoreError);
  });
});

describe("graphs", () => {
  test("a graph is a subgraph of shared nodes and edges with its own positions", () => {
    const one = store.createGraph("one");
    const two = store.createGraph("two");
    const a = store.createNodeInGraph(one.id, { name: "A" }, { x: 10, y: 20 });
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });

    store.addNodeToGraph(two.id, a.id, { x: 500, y: 500 });
    expect(store.view(two.id).edges).toEqual([]);
    const second = store.addNodeToGraph(two.id, b.id, null);
    expect(second.edges.map(({ id }) => id)).toEqual([edge.id]);

    store.updateNode(a.id, { name: "A2" });
    expect(store.view(one.id).nodes[0]).toMatchObject({ name: "A2", position: { x: 10, y: 20 } });
    expect(store.view(two.id).nodes[0]).toMatchObject({ name: "A2", position: { x: 500, y: 500 } });
  });

  test("removing a node from a graph removes its edges from that graph only", () => {
    const one = store.createGraph("one");
    const two = store.createGraph("two");
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    store.addNodeToGraph(two.id, a.id, null);
    store.addNodeToGraph(two.id, b.id, null);

    store.removeNodeFromGraph(one.id, b.id);
    expect(store.view(one.id)).toMatchObject({ nodes: [{ id: a.id }], edges: [] });
    expect(store.view(two.id).edges).toHaveLength(1);
    expect(store.listNodes()).toHaveLength(2);
  });

  test("an edge needs both nodes in the graph", () => {
    const one = store.createGraph("one");
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const outside = store.createNode({ name: "Outside" });
    expect(() => store.createEdgeInGraph(one.id, { source: a.id, target: outside.id })).toThrow(
      "Both nodes of the edge must be in the graph first.",
    );
    const edge = store.createEdge({ source: a.id, target: outside.id });
    expect(() => store.addEdgeToGraph(one.id, edge.id)).toThrow(StoreError);
  });

  test("moving an edge endpoint out of a graph drops it from that graph", () => {
    const one = store.createGraph("one");
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const outside = store.createNode({ name: "Outside" });
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    store.updateEdge(edge.id, { target: outside.id });
    expect(store.view(one.id).edges).toEqual([]);
  });

  test("deleting a graph keeps its nodes and edges", () => {
    const one = store.createGraph("one");
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: a.id });
    store.deleteGraph(one.id);
    expect(store.listGraphs()).toEqual([]);
    expect(store.listNodes()).toHaveLength(1);
    expect(store.listEdges()).toHaveLength(1);
  });

  test("graph names are unique", () => {
    store.createGraph("one");
    expect(() => store.createGraph("one")).toThrow("A graph with this name already exists.");
  });
});
