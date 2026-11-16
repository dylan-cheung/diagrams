import { Database } from "bun:sqlite";
import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { StoreError, contentHash, openGraphStore, type GraphStore } from "./db.ts";
import type { EdgeInput, NodeInput } from "./model.ts";
import { DEFAULT_VOCABULARY } from "./vocabulary.ts";
import { ensureWalkthrough, WALKTHROUGH_ID } from "./walkthrough.ts";

let store: GraphStore;

beforeEach(() => {
  store = openGraphStore(":memory:");
});

describe("nodes and edges", () => {
  let home: string;
  beforeEach(() => {
    home = store.createGraph({ name: "home", description: "Test graph." }).id;
  });
  const addNode = (input: NodeInput) => store.createNodeInGraph(home, input, null);
  const addEdge = (input: EdgeInput) => store.createEdgeInGraph(home, input);

  test("allows parallel edges, loops, and both directions between the same nodes", () => {
    const a = addNode({ name: "A", labels: [" Person ", "Person", ""] });
    const b = addNode({ name: "B" });
    addEdge({ source: a.id, target: b.id, label: "knows" });
    addEdge({ source: a.id, target: b.id, label: "owes" });
    addEdge({ source: b.id, target: a.id });
    addEdge({ source: a.id, target: a.id, directed: false });
    expect(a.labels).toEqual(["Person"]);
    expect(store.listEdges().map(({ label, directed }) => [label, directed])).toEqual([
      ["knows", true],
      ["owes", true],
      ["", true],
      ["", false],
    ]);
  });

  test("a node has an optional description", () => {
    const a = addNode({ name: "A" });
    expect(a.description).toBe("");
    expect(store.updateNode(a.id, { description: " Does A things. " })).toMatchObject({ name: "A", description: "Does A things." });
    expect(addNode({ name: "B", description: "Does B things." }).description).toBe("Does B things.");
  });

  test("deleting a node deletes its edges everywhere", () => {
    const a = addNode({ name: "A" });
    const b = addNode({ name: "B" });
    addEdge({ source: a.id, target: b.id });
    store.deleteNode(b.id);
    expect(store.listEdges()).toEqual([]);
  });

  test("rejects an edge to a missing node", () => {
    const a = addNode({ name: "A" });
    expect(() => addEdge({ source: a.id, target: "missing" })).toThrow(StoreError);
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

  test("removing a node or an edge from its only graph deletes it", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const c = store.createNodeInGraph(one.id, { name: "C" }, null);
    const ab = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    store.createEdgeInGraph(one.id, { source: b.id, target: c.id });

    store.removeEdgeFromGraph(one.id, ab.id);
    expect(store.listEdges()).toHaveLength(1);
    store.removeNodeFromGraph(one.id, c.id);
    expect(store.listNodes().map(({ name }) => name)).toEqual(["A", "B"]);
    expect(store.listEdges()).toEqual([]);
  });

  test("an edge needs both nodes in the graph", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const outside = store.createNodeInGraph(two.id, { name: "Outside" }, null);
    expect(() => store.createEdgeInGraph(one.id, { source: a.id, target: outside.id })).toThrow(
      "Both nodes of the edge must be in the graph first.",
    );
    store.addNodeToGraph(two.id, a.id, null);
    const edge = store.createEdgeInGraph(two.id, { source: a.id, target: outside.id });
    expect(() => store.addEdgeToGraph(one.id, edge.id)).toThrow(StoreError);
  });

  test("moving an edge endpoint out of a graph drops it from that graph", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const outside = store.createNodeInGraph(two.id, { name: "Outside" }, null);
    store.addNodeToGraph(two.id, a.id, null);
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    store.addNodeToGraph(two.id, b.id, null);
    expect(() => store.updateEdge(edge.id, { target: outside.id })).not.toThrow();
    expect(store.view(one.id).edges).toEqual([]);
    expect(store.view(two.id).edges.map(({ id }) => id)).toEqual([edge.id]);
  });

  test("rejects an edge change that would leave the edge in no graph", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    const b = store.createNodeInGraph(one.id, { name: "B" }, null);
    const outside = store.createNodeInGraph(two.id, { name: "Outside" }, null);
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    expect(() => store.updateEdge(edge.id, { target: outside.id })).toThrow("The edge would leave every graph.");
    expect(store.getEdge(edge.id).target).toBe(b.id);
  });

  test("deleting a graph deletes the nodes and edges that no other graph holds", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    store.createNodeInGraph(one.id, { name: "B" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: a.id });
    store.addNodeToGraph(two.id, a.id, null);
    store.deleteGraph(one.id);
    expect(store.listGraphs().map(({ name }) => name)).toEqual(["two"]);
    expect(store.listNodes().map(({ name }) => name)).toEqual(["A"]);
    expect(store.listEdges()).toHaveLength(1);
    store.deleteGraph(two.id);
    expect(store.listNodes()).toEqual([]);
    expect(store.listEdges()).toEqual([]);
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

  test("a graph keeps its layout direction, and the direction is not a change to publish", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    expect(one.direction).toBe("horizontal");
    store.publish(one.id);
    const updated = store.updateGraph(one.id, { direction: "vertical" });
    expect(updated).toMatchObject({ name: "one", direction: "vertical" });
    expect(store.listGraphs()[0]).toMatchObject({ direction: "vertical", changed: false });
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
    old.run("CREATE TABLE graph_nodes (graph_id TEXT NOT NULL, node_id TEXT NOT NULL, x REAL, y REAL, PRIMARY KEY (graph_id, node_id))");
    old.run("INSERT INTO graph_nodes (graph_id, node_id) VALUES ('g1', 'n1')");
    old.close();
    const migrated = openGraphStore(path);
    expect(migrated.listGraphs()[0]).toMatchObject({ name: "legacy", description: "", direction: "horizontal" });
    expect(migrated.listNodes()[0]).toMatchObject({ name: "old node", description: "", type: null, intent: "", status: null });
    migrated.close();
  });

  test("deletes nodes and edges that are in no graph when it opens", () => {
    const path = join(mkdtempSync(join(tmpdir(), "graphs-")), "orphans.sqlite");
    const first = openGraphStore(path);
    const one = first.createGraph({ name: "one", description: "Test graph one." });
    const a = first.createNodeInGraph(one.id, { name: "A" }, null);
    const b = first.createNodeInGraph(one.id, { name: "B" }, null);
    first.createEdgeInGraph(one.id, { source: a.id, target: b.id });
    first.close();
    const raw = new Database(path);
    raw.run("DELETE FROM graph_edges");
    raw.query("DELETE FROM graph_nodes WHERE node_id = $id").run({ $id: b.id });
    raw.close();
    const reopened = openGraphStore(path);
    expect(reopened.listNodes().map(({ name }) => name)).toEqual(["A"]);
    expect(reopened.listEdges()).toEqual([]);
    reopened.close();
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

  test("the graph list shows the latest version, draft changes and open proposals", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    expect(store.listGraphs()[0]).toMatchObject({ published: null, changed: false, openProposals: 0 });
    store.publish(one.id);
    expect(store.listGraphs()[0]).toMatchObject({ published: 1, changed: false });
    store.updateNode(a.id, { name: "A2" });
    store.createProposal(one.id, { title: "Rename", nodes: [{ id: a.id, name: "A3" }], edges: [] });
    expect(store.listGraphs()[0]).toMatchObject({ published: 1, changed: true, openProposals: 1 });
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

describe("proposals", () => {
  const setup = () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const two = store.createGraph({ name: "two", description: "Test graph two." });
    const a = store.createNodeInGraph(one.id, { name: "A", properties: { rule: "x > 1" } }, { x: 0, y: 0 });
    const b = store.createNodeInGraph(one.id, { name: "B" }, { x: 200, y: 0 });
    const edge = store.createEdgeInGraph(one.id, { source: a.id, target: b.id, label: "yes" });
    store.addNodeToGraph(two.id, a.id, null);
    store.publish(one.id);
    return { one, two, a, b, edge };
  };

  test("a proposal does not change the graph, and its diff lists each change", () => {
    const { one, a, b, edge } = setup();
    const proposal = store.createProposal(one.id, {
      title: "Add a review step",
      workItem: "PROJ-1",
      nodes: [{ id: a.id, properties: { rule: "x > 2" } }, { id: "review", name: "Review", position: { x: 400, y: 0 } }],
      edges: [{ id: "to-review", source: a.id, target: "review", label: "no" }],
    });
    expect(proposal).toMatchObject({ status: "open", baseVersion: 1, workItem: "PROJ-1", sharedWith: { [a.id]: ["two"] } });
    expect(proposal.content.nodes[0]).toMatchObject({ name: "A", position: { x: 0, y: 0 } });
    expect(store.view(one.id).nodes).toHaveLength(2);

    const { against, diff } = store.diffProposal(one.id, proposal.id, "latest");
    expect(against).toBe(1);
    expect(diff.nodes.map(({ id, status }) => [id, status])).toEqual([
      [a.id, "changed"],
      ["review", "added"],
      [b.id, "removed"],
    ]);
    expect(diff.nodes[0]?.fields).toEqual([{ field: "properties.rule", before: "x > 1", after: "x > 2" }]);
    expect(diff.edges.map(({ id, status }) => [id, status])).toEqual([
      ["to-review", "added"],
      [edge.id, "removed"],
    ]);
  });

  test("rejects an edge to a node that is not in the proposal", () => {
    const { one, a } = setup();
    expect(() =>
      store.createProposal(one.id, { title: "Bad", nodes: [{ id: a.id }], edges: [{ id: "e", source: a.id, target: "missing" }] }),
    ).toThrow("The edge e connects a node that is not in the proposal.");
    expect(() => store.createProposal(one.id, { title: "Bad", nodes: [{ id: "new" }], edges: [] })).toThrow("The new node new needs a name.");
  });

  test("applying a proposal makes the graph equal to it and can publish", () => {
    const { one, two, a, b, edge } = setup();
    const proposal = store.createProposal(one.id, {
      title: "Rework",
      graph: { description: "A new purpose." },
      nodes: [{ id: a.id, name: "A2" }, { id: b.id }, { id: "c", name: "C", position: { x: 9, y: 9 } }],
      edges: [{ id: edge.id, label: "maybe" }, { id: "b-c", source: b.id, target: "c" }],
    });
    const { proposal: applied, version } = store.applyProposal(one.id, proposal.id, true);
    expect(applied.status).toBe("applied");
    expect(version?.version).toBe(2);

    const after = store.view(one.id);
    expect(after.graph.description).toBe("A new purpose.");
    expect(after.nodes.map(({ name }) => name)).toEqual(["A2", "B", "C"]);
    expect(after.edges.map(({ label }) => label)).toEqual(["maybe", ""]);
    expect(store.view(two.id).nodes[0]?.name).toBe("A2");
    expect(store.diffProposal(one.id, proposal.id, "latest").diff.nodes.every(({ status }) => status === "unchanged")).toBe(true);
    expect(() => store.applyProposal(one.id, proposal.id, false)).toThrow("The proposal is applied. Only an open proposal can change.");
  });

  test("applying a proposal removes nodes and edges that it does not hold", () => {
    const { one, a, b } = setup();
    const proposal = store.createProposal(one.id, { title: "Drop B", nodes: [{ id: a.id }], edges: [] });
    store.applyProposal(one.id, proposal.id, false);
    expect(store.view(one.id)).toMatchObject({ nodes: [{ id: a.id }], edges: [] });
    expect(() => store.getNode(b.id)).toThrow("The node does not exist.");
  });

  test("a discarded proposal cannot be applied or revised", () => {
    const { one, a } = setup();
    const proposal = store.createProposal(one.id, { title: "Maybe", nodes: [{ id: a.id }], edges: [] });
    expect(store.discardProposal(one.id, proposal.id).status).toBe("discarded");
    expect(() => store.reviseProposal(one.id, proposal.id, { title: "Again", nodes: [], edges: [] })).toThrow(StoreError);
    expect(store.view(one.id).nodes).toHaveLength(2);
    expect(store.listProposals(one.id).map(({ status }) => status)).toEqual(["discarded"]);
  });

  test("compares with the draft, or with nothing when the graph is not published", () => {
    const fresh = store.createGraph({ name: "fresh", description: "Not published." });
    const proposal = store.createProposal(fresh.id, { title: "Start", nodes: [{ id: "s", name: "Start" }], edges: [] });
    expect(store.diffProposal(fresh.id, proposal.id, "latest")).toMatchObject({ against: "empty", diff: { nodes: [{ status: "added" }] } });
    expect(store.diffProposal(fresh.id, proposal.id, "draft").diff.graph).toEqual([]);
  });
});

describe("design vocabulary", () => {
  let home: string;
  beforeEach(() => {
    home = store.createGraph({ name: "home", description: "Test graph." }).id;
  });
  const addNode = (input: NodeInput) => store.createNodeInGraph(home, input, null);
  const addEdge = (input: EdgeInput) => store.createEdgeInGraph(home, input);

  test("nodes and edges keep a type, an intent and a lifecycle status", () => {
    const api = addNode({ name: "API", type: "service", intent: " Serve claims. ", status: "active" });
    const db = addNode({ name: "Claims DB", type: "database" });
    const edge = addEdge({ source: api.id, target: db.id, type: "writes-to", description: "Saves each claim.", status: "planned" });
    expect(api).toMatchObject({ type: "service", intent: "Serve claims.", status: "active" });
    expect(db).toMatchObject({ type: "database", intent: "", status: null });
    expect(edge).toMatchObject({ type: "writes-to", label: "", description: "Saves each claim.", intent: "", status: "planned" });

    expect(store.updateNode(api.id, { name: "Claims API" })).toMatchObject({ type: "service", status: "active" });
    expect(store.updateNode(api.id, { type: null, status: "deprecated" })).toMatchObject({ type: null, status: "deprecated" });
    expect(store.updateEdge(edge.id, { type: "reads-from" })).toMatchObject({ type: "reads-from", description: "Saves each claim." });
  });

  test("rejects a type or a status that is not in the vocabulary", () => {
    const a = addNode({ name: "A" });
    expect(() => addNode({ name: "B", type: "server" })).toThrow("The node type server is not in the vocabulary.");
    expect(() => store.updateNode(a.id, { status: "done" })).toThrow("The status done is not in the vocabulary.");
    expect(() => addEdge({ source: a.id, target: a.id, type: "service" })).toThrow("The relationship type service is not in the vocabulary.");
  });

  test("uses the vocabulary it is given", () => {
    const custom = openGraphStore(":memory:", {
      nodeTypes: [{ id: "queue", name: "Queue", description: "" }],
      relationshipTypes: [],
      statuses: [],
    });
    const graph = custom.createGraph({ name: "custom", description: "Test graph." });
    expect(custom.createNodeInGraph(graph.id, { name: "Jobs", type: "queue" }, null).type).toBe("queue");
    expect(() => custom.createNodeInGraph(graph.id, { name: "API", type: "service" }, null)).toThrow(StoreError);
    custom.close();
  });

  test("a proposal can set and clear design fields, and its diff lists them", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A", type: "service", status: "active" }, { x: 0, y: 0 });
    store.publish(one.id);
    expect(() => store.createProposal(one.id, { title: "Bad", nodes: [{ id: a.id, type: "server" }], edges: [] })).toThrow(
      `${a.id}: The node type server is not in the vocabulary.`,
    );

    const proposal = store.createProposal(one.id, {
      title: "Split the queue out",
      nodes: [
        { id: a.id, status: null, intent: "Accept claims." },
        { id: "queue", name: "Claims queue", type: "external-system", status: "proposed" },
      ],
      edges: [{ id: "a-queue", source: a.id, target: "queue", type: "publishes-event", intent: "Decouple intake." }],
    });
    expect(proposal.content.nodes[0]).toMatchObject({ type: "service", status: null, intent: "Accept claims." });
    const { diff } = store.diffProposal(one.id, proposal.id, "latest");
    expect(diff.nodes[0]?.fields).toEqual([
      { field: "status", before: "active", after: null },
      { field: "intent", before: "", after: "Accept claims." },
    ]);
    expect(diff.edges[0]).toMatchObject({ status: "added", after: { type: "publishes-event", intent: "Decouple intake." } });

    store.applyProposal(one.id, proposal.id, false);
    const after = store.view(one.id);
    expect(after.nodes.map(({ type, status }) => [type, status])).toEqual([
      ["service", null],
      ["external-system", "proposed"],
    ]);
    expect(after.edges[0]).toMatchObject({ type: "publishes-event", intent: "Decouple intake." });
  });

  test("the content hash does not change for a graph that uses no design fields", () => {
    const one = store.createGraph({ name: "one", description: "Test graph one." });
    const a = store.createNodeInGraph(one.id, { name: "A" }, null);
    store.createEdgeInGraph(one.id, { source: a.id, target: a.id, label: "loop" });
    const view = store.view(one.id);
    const legacy = {
      ...view,
      nodes: view.nodes.map(({ type, intent, status, ...node }) => node),
      edges: view.edges.map(({ type, description, intent, status, ...edge }) => edge),
    } as unknown as typeof view;
    expect(contentHash(legacy)).toBe(contentHash(view));
    expect(contentHash({ ...view, nodes: view.nodes.map((node) => ({ ...node, status: "active" })) })).not.toBe(contentHash(view));
  });
});

describe("walkthrough graph", () => {
  test("uses every default node type, relationship type and status, and is made only once", () => {
    expect(ensureWalkthrough(store)).toBe(true);
    expect(ensureWalkthrough(store)).toBe(false);
    const { graph, nodes, edges } = store.view(WALKTHROUGH_ID);
    expect(graph.direction).toBe("vertical");
    expect(store.listVersions(WALKTHROUGH_ID).map(({ version }) => version)).toEqual([1]);
    const ids = (terms: { id: string }[]) => terms.map(({ id }) => id).sort();
    expect([...new Set(nodes.map(({ type }) => type))].sort()).toEqual(ids(DEFAULT_VOCABULARY.nodeTypes));
    expect([...new Set(edges.flatMap(({ type }) => (type == null ? [] : [type])))].sort()).toEqual(ids(DEFAULT_VOCABULARY.relationshipTypes));
    expect([...new Set([...nodes, ...edges].flatMap(({ status }) => (status == null ? [] : [status])))].sort()).toEqual(ids(DEFAULT_VOCABULARY.statuses));
    expect(edges.some(({ source, target }) => source === target)).toBe(true);
    expect(edges.some(({ directed }) => !directed)).toBe(true);
  });
});
