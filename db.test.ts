import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
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

  test("a node has an optional description", () => {
    const a = store.createNode({ name: "A" });
    expect(a.description).toBe("");
    expect(store.updateNode(a.id, { description: " Does A things. " })).toMatchObject({ name: "A", description: "Does A things." });
    expect(store.createNode({ name: "B", description: "Does B things." }).description).toBe("Does B things.");
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
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
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
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
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
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const outside = store.createNode({ name: "Outside" });
    expect(() => store.createEdgeInGraph(one.id, { source: a.id, target: outside.id })).toThrow(
      "Both nodes of the edge must be in the graph first.",
    );
    const edge = store.createEdge({ source: a.id, target: outside.id });
    expect(() => store.addEdgeToGraph(one.id, edge.id)).toThrow(StoreError);
  });

  test("moving an edge endpoint out of a graph drops it from that graph", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const outside = store.createNode({ name: "Outside" });
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    store.updateEdge(edge.id, { target: outside.id });
    expect(store.view(one.id).edges).toEqual([]);
  });

  test("deleting a graph keeps its nodes and edges", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: a.id });
    store.deleteGraph(one.id);
    expect(store.listGraphs()).toEqual([]);
    expect(store.listNodes()).toHaveLength(1);
    expect(store.listEdges()).toHaveLength(1);
  });

  test("graph names are unique", () => {
    store.createGraph({ name: "one", description: "Test graph one." });
    expect(() => store.createGraph({ name: "one", description: "Test graph one." })).toThrow("A graph with this name already exists.");
  });

  test("a graph keeps a description of its purpose", () => {
    const one = store.createGraph({ name: "one", description: " Why one exists. " });
    expect(one.description).toBe("Why one exists.");
    const updated = store.updateGraph(one.id, { description: "A new purpose." });
    expect(updated).toMatchObject({ name: "one", description: "A new purpose." });
    expect(store.listGraphs()[0]).toMatchObject({ description: "A new purpose." });
  });

  test("adds the description columns to a database made before they existed", () => {
    const path = join(mkdtempSync(join(tmpdir(), "graphs-")), "old.sqlite");
    const old = new Database(path, { create: true });
    old.run("CREATE TABLE graphs (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)");
    old.run("INSERT INTO graphs VALUES ('g1', 'legacy', '2026-10-29T00:00:00.000Z', '2026-10-29T00:00:00.000Z')");
    old.run(
      "CREATE TABLE nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, labels TEXT NOT NULL DEFAULT '[]', properties TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL)",
    );
    old.run("INSERT INTO nodes (id, name, created_at, updated_at) VALUES ('n1', 'old node', '2026-10-29T00:00:00.000Z', '2026-10-29T00:00:00.000Z')");
    old.close();
    const migrated = openGraphStore(path);
    expect(migrated.listGraphs()[0]).toMatchObject({ name: "legacy", description: "" });
    expect(migrated.listNodes()[0]).toMatchObject({ name: "old node", description: "" });
    migrated.close();
  });
});

describe("published versions", () => {
  test("a version keeps the graph as it was when published", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A", properties: { rule: "x > 1" } }, { x: 1, y: 2 });
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: b.id, label: "yes" });

    const first = store.publish(one.id);
    expect(first).toMatchObject({ graphId: one.id, version: 1 });
    store.updateNode(a.id, { properties: { rule: "x > 2" } });
    store.removeNodeFromGraph(one.id, b.id);

    const kept = store.getVersion(one.id, 1);
    expect(kept.hash).toBe(first.hash);
    expect(kept.view.nodes.map(({ name, properties }) => [name, properties])).toEqual([
      ["A", { rule: "x > 1" }],
      ["B", {}],
    ]);
    expect(kept.view.edges).toHaveLength(1);
    expect(store.publish(one.id).version).toBe(2);
    expect(store.getVersion(one.id, "latest").view.nodes[0]?.properties).toEqual({ rule: "x > 2" });
    expect(store.listVersions(one.id).map(({ version }) => version)).toEqual([2, 1]);
  });

  test("publishing with no changes returns the latest version", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, { x: 0, y: 0 });
    const first = store.publish(one.id);
    store.moveNodes(one.id, { [a.id]: { x: 50, y: 50 } });
    expect(store.publish(one.id)).toEqual(first);
    expect(store.listVersions(one.id)).toHaveLength(1);
  });

  test("an edit to a shared node does not change a version of another graph", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    store.addNodeToGraph(two.id, a.id, null);
    store.publish(two.id);
    store.updateNode(a.id, { name: "A2" });
    expect(store.getVersion(two.id, 1).view.nodes[0]?.name).toBe("A");
  });

  test("versions stay after the graph is deleted", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    store.createNodeInGraph(one.id, { name: "A" }, null);
    store.publish(one.id);
    store.deleteGraph(one.id);
    expect(store.getVersion(one.id, 1).view.graph.name).toBe("one");
    expect(() => store.getVersion(one.id, 2)).toThrow("The graph version does not exist.");
  });
});
