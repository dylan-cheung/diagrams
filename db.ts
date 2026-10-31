import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import {
  normalizeLabels,
  type EdgeInput,
  type Graph,
  type GraphEdge,
  type GraphInput,
  type GraphNode,
  type GraphSummary,
  type GraphView,
  type NodeInput,
  type Position,
  type Properties,
} from "./model.ts";

type NodeRow = { id: string; name: string; description: string; labels: string; properties: string; created_at: string; updated_at: string };

type EdgeRow = {
  id: string;
  source: string;
  target: string;
  directed: number;
  label: string;
  properties: string;
  created_at: string;
  updated_at: string;
};

type GraphRow = { id: string; name: string; description: string; created_at: string; updated_at: string };

type PlacedNodeRow = NodeRow & { x: number | null; y: number | null };

export class StoreError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409,
  ) {
    super(message);
  }
}

const toNode = (row: NodeRow): GraphNode => ({
  id: row.id,
  name: row.name,
  description: row.description,
  labels: JSON.parse(row.labels) as string[],
  properties: JSON.parse(row.properties) as Properties,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toEdge = (row: EdgeRow): GraphEdge => ({
  id: row.id,
  source: row.source,
  target: row.target,
  directed: row.directed === 1,
  label: row.label,
  properties: JSON.parse(row.properties) as Properties,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toGraph = (row: GraphRow): Graph => ({
  id: row.id,
  name: row.name,
  description: row.description,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  labels TEXT NOT NULL DEFAULT '[]',
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS edges (
  id TEXT PRIMARY KEY,
  source TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  target TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  directed INTEGER NOT NULL DEFAULT 1,
  label TEXT NOT NULL DEFAULT '',
  properties TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS edges_source ON edges(source);
CREATE INDEX IF NOT EXISTS edges_target ON edges(target);
CREATE TABLE IF NOT EXISTS graphs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS graph_nodes (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  x REAL,
  y REAL,
  PRIMARY KEY (graph_id, node_id)
);
CREATE TABLE IF NOT EXISTS graph_edges (
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  edge_id TEXT NOT NULL REFERENCES edges(id) ON DELETE CASCADE,
  PRIMARY KEY (graph_id, edge_id)
);
`;

export const openGraphStore = (path: string) => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  for (const table of ["nodes", "graphs"]) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some(({ name }) => name === "description")) db.run(`ALTER TABLE ${table} ADD COLUMN description TEXT NOT NULL DEFAULT ''`);
  }

  const now = () => new Date().toISOString();

  const nodeById = db.query<NodeRow, { id: string }>("SELECT * FROM nodes WHERE id = $id");
  const edgeById = db.query<EdgeRow, { id: string }>("SELECT * FROM edges WHERE id = $id");
  const graphById = db.query<GraphRow, { id: string }>("SELECT * FROM graphs WHERE id = $id");
  const membership = db.query<{ found: number }, { graphId: string; nodeId: string }>(
    "SELECT 1 AS found FROM graph_nodes WHERE graph_id = $graphId AND node_id = $nodeId",
  );

  const requireNode = (id: string) => {
    const row = nodeById.get({ id });
    if (row == null) throw new StoreError("The node does not exist.", 404);
    return toNode(row);
  };

  const requireEdge = (id: string) => {
    const row = edgeById.get({ id });
    if (row == null) throw new StoreError("The edge does not exist.", 404);
    return toEdge(row);
  };

  const requireGraph = (id: string) => {
    const row = graphById.get({ id });
    if (row == null) throw new StoreError("The graph does not exist.", 404);
    return toGraph(row);
  };

  const uniqueName = <T>(action: () => T) => {
    try {
      return action();
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed")) {
        throw new StoreError("A graph with this name already exists.", 409);
      }
      throw error;
    }
  };

  const touchGraph = (graphId: string) =>
    db.query("UPDATE graphs SET updated_at = $now WHERE id = $graphId").run({ graphId, now: now() });

  const createNode = (input: NodeInput) => {
    const id = crypto.randomUUID();
    const stamp = now();
    db.query(
      "INSERT INTO nodes (id, name, description, labels, properties, created_at, updated_at) VALUES ($id, $name, $description, $labels, $properties, $stamp, $stamp)",
    ).run({
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      labels: JSON.stringify(normalizeLabels(input.labels ?? [])),
      properties: JSON.stringify(input.properties ?? {}),
      stamp,
    });
    return requireNode(id);
  };

  const updateNode = (id: string, input: Partial<NodeInput>) => {
    const node = requireNode(id);
    db.query(
      "UPDATE nodes SET name = $name, description = $description, labels = $labels, properties = $properties, updated_at = $now WHERE id = $id",
    ).run({
      id,
      name: input.name?.trim() ?? node.name,
      description: input.description?.trim() ?? node.description,
      labels: JSON.stringify(normalizeLabels(input.labels ?? node.labels)),
      properties: JSON.stringify(input.properties ?? node.properties),
      now: now(),
    });
    return requireNode(id);
  };

  const createEdge = (input: EdgeInput) => {
    requireNode(input.source);
    requireNode(input.target);
    const id = crypto.randomUUID();
    const stamp = now();
    db.query(
      "INSERT INTO edges (id, source, target, directed, label, properties, created_at, updated_at) VALUES ($id, $source, $target, $directed, $label, $properties, $stamp, $stamp)",
    ).run({
      id,
      source: input.source,
      target: input.target,
      directed: input.directed ?? true ? 1 : 0,
      label: input.label?.trim() ?? "",
      properties: JSON.stringify(input.properties ?? {}),
      stamp,
    });
    return requireEdge(id);
  };

  const updateEdge = (id: string, input: Partial<EdgeInput>) => {
    const edge = requireEdge(id);
    if (input.source !== undefined) requireNode(input.source);
    if (input.target !== undefined) requireNode(input.target);
    db.query(
      "UPDATE edges SET source = $source, target = $target, directed = $directed, label = $label, properties = $properties, updated_at = $now WHERE id = $id",
    ).run({
      id,
      source: input.source ?? edge.source,
      target: input.target ?? edge.target,
      directed: input.directed ?? edge.directed ? 1 : 0,
      label: input.label?.trim() ?? edge.label,
      properties: JSON.stringify(input.properties ?? edge.properties),
      now: now(),
    });
    db.query(
      `DELETE FROM graph_edges WHERE edge_id = $id AND NOT (
        EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.graph_id = graph_edges.graph_id AND gn.node_id = $source)
        AND EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.graph_id = graph_edges.graph_id AND gn.node_id = $target)
      )`,
    ).run({ id, source: input.source ?? edge.source, target: input.target ?? edge.target });
    return requireEdge(id);
  };

  const placeNode = (graphId: string, nodeId: string, position: Position | null, includeEdges: boolean) => {
    requireGraph(graphId);
    requireNode(nodeId);
    db.query(
      `INSERT INTO graph_nodes (graph_id, node_id, x, y) VALUES ($graphId, $nodeId, $x, $y)
       ON CONFLICT (graph_id, node_id) DO UPDATE SET x = excluded.x, y = excluded.y`,
    ).run({ graphId, nodeId, x: position?.x ?? null, y: position?.y ?? null });
    if (includeEdges) {
      db.query(
        `INSERT OR IGNORE INTO graph_edges (graph_id, edge_id)
         SELECT $graphId, e.id FROM edges e
         WHERE (e.source = $nodeId OR e.target = $nodeId)
           AND e.source IN (SELECT node_id FROM graph_nodes WHERE graph_id = $graphId)
           AND e.target IN (SELECT node_id FROM graph_nodes WHERE graph_id = $graphId)`,
      ).run({ graphId, nodeId });
    }
    touchGraph(graphId);
  };

  const includeEdge = (graphId: string, edgeId: string) => {
    requireGraph(graphId);
    const edge = requireEdge(edgeId);
    const missing = [edge.source, edge.target].filter((nodeId) => membership.get({ graphId, nodeId }) == null);
    if (missing.length > 0) throw new StoreError("Both nodes of the edge must be in the graph first.", 400);
    db.query("INSERT OR IGNORE INTO graph_edges (graph_id, edge_id) VALUES ($graphId, $edgeId)").run({ graphId, edgeId });
    touchGraph(graphId);
  };

  const view = (graphId: string): GraphView => {
    const graph = requireGraph(graphId);
    const nodes = db
      .query<PlacedNodeRow, { graphId: string }>(
        "SELECT n.*, gn.x, gn.y FROM graph_nodes gn JOIN nodes n ON n.id = gn.node_id WHERE gn.graph_id = $graphId ORDER BY n.created_at, n.rowid",
      )
      .all({ graphId })
      .map((row) => ({ ...toNode(row), position: row.x == null || row.y == null ? null : { x: row.x, y: row.y } }));
    const edges = db
      .query<EdgeRow, { graphId: string }>(
        "SELECT e.* FROM graph_edges ge JOIN edges e ON e.id = ge.edge_id WHERE ge.graph_id = $graphId ORDER BY e.created_at, e.rowid",
      )
      .all({ graphId })
      .map(toEdge);
    return { graph, nodes, edges };
  };

  return {
    listNodes: () => db.query<NodeRow, []>("SELECT * FROM nodes ORDER BY name COLLATE NOCASE").all().map(toNode),
    getNode: requireNode,
    createNode,
    updateNode,
    deleteNode: (id: string) => {
      requireNode(id);
      db.query("DELETE FROM nodes WHERE id = $id").run({ id });
    },

    listEdges: () => db.query<EdgeRow, []>("SELECT * FROM edges ORDER BY created_at, rowid").all().map(toEdge),
    getEdge: requireEdge,
    createEdge,
    updateEdge,
    deleteEdge: (id: string) => {
      requireEdge(id);
      db.query("DELETE FROM edges WHERE id = $id").run({ id });
    },

    listGraphs: (): GraphSummary[] =>
      db
        .query<GraphRow & { node_count: number; edge_count: number }, []>(
          `SELECT g.*,
            (SELECT COUNT(*) FROM graph_nodes WHERE graph_id = g.id) AS node_count,
            (SELECT COUNT(*) FROM graph_edges WHERE graph_id = g.id) AS edge_count
           FROM graphs g ORDER BY g.name COLLATE NOCASE`,
        )
        .all()
        .map((row) => ({ ...toGraph(row), nodeCount: row.node_count, edgeCount: row.edge_count })),
    createGraph: (input: GraphInput) => {
      const id = crypto.randomUUID();
      const stamp = now();
      uniqueName(() =>
        db
          .query("INSERT INTO graphs (id, name, description, created_at, updated_at) VALUES ($id, $name, $description, $stamp, $stamp)")
          .run({ id, name: input.name.trim(), description: input.description.trim(), stamp }),
      );
      return requireGraph(id);
    },
    updateGraph: (id: string, input: Partial<GraphInput>) => {
      const graph = requireGraph(id);
      uniqueName(() =>
        db.query("UPDATE graphs SET name = $name, description = $description, updated_at = $now WHERE id = $id").run({
          id,
          name: input.name?.trim() ?? graph.name,
          description: input.description?.trim() ?? graph.description,
          now: now(),
        }),
      );
      return requireGraph(id);
    },
    deleteGraph: (id: string) => {
      requireGraph(id);
      db.query("DELETE FROM graphs WHERE id = $id").run({ id });
    },
    view,

    addNodeToGraph: db.transaction((graphId: string, nodeId: string, position: Position | null) => {
      placeNode(graphId, nodeId, position, true);
      return view(graphId);
    }),
    moveNodes: db.transaction((graphId: string, positions: Record<string, Position>) => {
      requireGraph(graphId);
      const move = db.query("UPDATE graph_nodes SET x = $x, y = $y WHERE graph_id = $graphId AND node_id = $nodeId");
      for (const [nodeId, { x, y }] of Object.entries(positions)) move.run({ graphId, nodeId, x, y });
    }),
    removeNodeFromGraph: db.transaction((graphId: string, nodeId: string) => {
      requireGraph(graphId);
      db.query(
        "DELETE FROM graph_edges WHERE graph_id = $graphId AND edge_id IN (SELECT id FROM edges WHERE source = $nodeId OR target = $nodeId)",
      ).run({ graphId, nodeId });
      db.query("DELETE FROM graph_nodes WHERE graph_id = $graphId AND node_id = $nodeId").run({ graphId, nodeId });
      touchGraph(graphId);
    }),
    createNodeInGraph: db.transaction((graphId: string, input: NodeInput, position: Position | null) => {
      requireGraph(graphId);
      const node = createNode(input);
      placeNode(graphId, node.id, position, false);
      return node;
    }),
    addEdgeToGraph: db.transaction((graphId: string, edgeId: string) => includeEdge(graphId, edgeId)),
    createEdgeInGraph: db.transaction((graphId: string, input: EdgeInput) => {
      requireGraph(graphId);
      const missing = [input.source, input.target].filter((nodeId) => membership.get({ graphId, nodeId }) == null);
      if (missing.length > 0) throw new StoreError("Both nodes of the edge must be in the graph first.", 400);
      const edge = createEdge(input);
      includeEdge(graphId, edge.id);
      return edge;
    }),
    removeEdgeFromGraph: (graphId: string, edgeId: string) => {
      requireGraph(graphId);
      db.query("DELETE FROM graph_edges WHERE graph_id = $graphId AND edge_id = $edgeId").run({ graphId, edgeId });
      touchGraph(graphId);
    },

    close: () => db.close(),
  };
};

export type GraphStore = ReturnType<typeof openGraphStore>;
