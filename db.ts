import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { itemRef, linkBetween, parseRef } from "./change-items.ts";
import { EMPTY_CONTENT, diffGraphs, toContent } from "./diff.ts";
import { branchDiff, GitError } from "./git-diff.ts";
import {
  EDGE_DESIGN_DEFAULTS,
  type Change,
  type ChangeInput,
  type ChangeLink,
  type IdeaItem,
  type PseudoBlock,
  NODE_DESIGN_DEFAULTS,
  normalizeLabels,
  type DraftState,
  type LayoutInput,
  type ContentEdge,
  type ContentNode,
  type EdgeInput,
  type FinishInput,
  type Flow,
  type FlowInput,
  type FlowStep,
  type Graph,
  type GraphContent,
  type GraphEdge,
  type GraphInput,
  type GraphPatch,
  type GraphNode,
  type GraphSummary,
  type GraphVersion,
  type GraphVersionSummary,
  type GraphView,
  type LayoutDirection,
  type NodeInput,
  type Position,
  type Properties,
  type Proposal,
  type ProposalInput,
  type ProposalSummary,
  type Run,
  type RunEvent,
  type RunInput,
  type Vocabulary,
} from "./model.ts";
import { DEFAULT_VOCABULARY, edgeDesignErrors, nodeDesignErrors } from "./vocabulary.ts";

type NodeRow = {
  id: string;
  name: string;
  description: string;
  type: string | null;
  intent: string;
  status: string | null;
  labels: string;
  properties: string;
  created_at: string;
  updated_at: string;
};

type EdgeRow = {
  id: string;
  source: string;
  target: string;
  directed: number;
  type: string | null;
  label: string;
  description: string;
  intent: string;
  status: string | null;
  properties: string;
  created_at: string;
  updated_at: string;
};

type GraphRow = { id: string; name: string; description: string; direction: LayoutDirection; created_at: string; updated_at: string };

type VersionRow = { graph_id: string; version: number; hash: string; published_at: string };

type FlowRow = { id: string; graph_id: string; name: string; description: string; steps: string; created_at: string; updated_at: string };

type RunRow = {
  id: string;
  graph_id: string;
  version: number;
  flow_id: string;
  label: string;
  status: Run["status"];
  note: string;
  properties: string;
  events: string;
  started_at: string;
  ended_at: string | null;
  updated_at: string;
};

type PlacedNodeRow = NodeRow & { x: number | null; y: number | null };

type ProposalRow = {
  id: string;
  graph_id: string;
  title: string;
  rationale: string;
  work_item: string;
  status: ProposalSummary["status"];
  base_version: number | null;
  content: string;
  created_at: string;
  updated_at: string;
};

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
  type: row.type,
  intent: row.intent,
  status: row.status,
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
  type: row.type,
  label: row.label,
  description: row.description,
  intent: row.intent,
  status: row.status,
  properties: JSON.parse(row.properties) as Properties,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toGraph = (row: GraphRow): Graph => ({
  id: row.id,
  name: row.name,
  description: row.description,
  direction: row.direction,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toVersionSummary = (row: VersionRow): GraphVersionSummary => ({
  graphId: row.graph_id,
  version: row.version,
  hash: row.hash,
  publishedAt: row.published_at,
});

const toProposalSummary = (row: ProposalRow): ProposalSummary => ({
  id: row.id,
  graphId: row.graph_id,
  title: row.title,
  rationale: row.rationale,
  workItem: row.work_item,
  status: row.status,
  baseVersion: row.base_version,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toFlow = (row: FlowRow): Flow => ({
  id: row.id,
  graphId: row.graph_id,
  name: row.name,
  description: row.description,
  steps: JSON.parse(row.steps) as FlowStep[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

type ChangeRow = {
  id: string;
  name: string;
  notes: string;
  graph_id: string | null;
  repo: string;
  base: string;
  branch: string;
  ideas: string;
  blocks: string;
  links: string;
  created_at: string;
  updated_at: string;
};

const toChange = (row: ChangeRow): Change => ({
  id: row.id,
  name: row.name,
  notes: row.notes,
  graphId: row.graph_id,
  repo: row.repo,
  base: row.base,
  branch: row.branch,
  ideas: JSON.parse(row.ideas) as IdeaItem[],
  blocks: JSON.parse(row.blocks) as PseudoBlock[],
  links: JSON.parse(row.links) as ChangeLink[],
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toRun = (row: RunRow): Run => ({
  id: row.id,
  graphId: row.graph_id,
  version: row.version,
  flowId: row.flow_id,
  label: row.label,
  status: row.status,
  note: row.note,
  properties: JSON.parse(row.properties) as Properties,
  events: JSON.parse(row.events) as RunEvent[],
  startedAt: row.started_at,
  endedAt: row.ended_at,
  updatedAt: row.updated_at,
});

type NodeFields = Omit<ContentNode, "id" | "position">;

type EdgeFields = Omit<ContentEdge, "id">;

const nodeFields = (n: NodeFields) => [n.name, n.description, n.type, n.intent, n.status, n.labels, n.properties];

const edgeFields = (e: EdgeFields) => [e.source, e.target, e.directed, e.type, e.label, e.description, e.intent, e.status, e.properties];

const sameNode = (a: NodeFields, b: NodeFields) => JSON.stringify(nodeFields(a)) === JSON.stringify(nodeFields(b));

const sameEdge = (a: EdgeFields, b: EdgeFields) => JSON.stringify(edgeFields(a)) === JSON.stringify(edgeFields(b));

const designOf = (defaults: Record<string, unknown>, item: Record<string, unknown>) =>
  Object.entries(defaults).every(([key, value]) => (item[key] ?? value) === value)
    ? []
    : [Object.fromEntries(Object.entries(defaults).map(([key, value]) => [key, item[key] ?? value]))];

const sortKeys = (properties: Properties) => Object.fromEntries(Object.entries(properties).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

export const contentHash = ({ graph, nodes, edges, flows }: GraphView) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        name: graph.name,
        description: graph.description,
        nodes: byId(nodes).map((n) => [n.id, n.name, n.description, n.labels, sortKeys(n.properties), ...designOf(NODE_DESIGN_DEFAULTS, n)]),
        edges: byId(edges).map((e) => [e.id, e.source, e.target, e.directed, e.label, sortKeys(e.properties), ...designOf(EDGE_DESIGN_DEFAULTS, e)]),
        ...(flows.length > 0 && { flows: byId(flows).map((f) => [f.id, f.name, f.description, f.steps.map((step) => [step.nodeId, step.edgeId])]) }),
      }),
    )
    .digest("hex");

const SCHEMA = `
CREATE TABLE IF NOT EXISTS nodes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT,
  intent TEXT NOT NULL DEFAULT '',
  status TEXT,
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
  type TEXT,
  label TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  intent TEXT NOT NULL DEFAULT '',
  status TEXT,
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
  direction TEXT NOT NULL DEFAULT 'horizontal',
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
CREATE TABLE IF NOT EXISTS graph_versions (
  graph_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  hash TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  published_at TEXT NOT NULL,
  PRIMARY KEY (graph_id, version)
);
CREATE TABLE IF NOT EXISTS proposals (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  rationale TEXT NOT NULL DEFAULT '',
  work_item TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'open',
  base_version INTEGER,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS proposals_graph ON proposals(graph_id);
CREATE TABLE IF NOT EXISTS flows (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL REFERENCES graphs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  steps TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS flows_graph ON flows(graph_id);
CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  graph_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  flow_id TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'running',
  note TEXT NOT NULL DEFAULT '',
  properties TEXT NOT NULL DEFAULT '{}',
  events TEXT NOT NULL DEFAULT '[]',
  started_at TEXT NOT NULL,
  ended_at TEXT,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS runs_graph ON runs(graph_id, flow_id);
CREATE TABLE IF NOT EXISTS changes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  graph_id TEXT REFERENCES graphs(id) ON DELETE SET NULL,
  repo TEXT NOT NULL DEFAULT '',
  base TEXT NOT NULL DEFAULT '',
  branch TEXT NOT NULL DEFAULT '',
  ideas TEXT NOT NULL DEFAULT '[]',
  blocks TEXT NOT NULL DEFAULT '[]',
  links TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`;

const ADDED_COLUMNS: [string, string, string][] = [
  ["nodes", "description", "TEXT NOT NULL DEFAULT ''"],
  ["graphs", "description", "TEXT NOT NULL DEFAULT ''"],
  ["graphs", "direction", "TEXT NOT NULL DEFAULT 'horizontal'"],
  ["nodes", "type", "TEXT"],
  ["nodes", "intent", "TEXT NOT NULL DEFAULT ''"],
  ["nodes", "status", "TEXT"],
  ["edges", "type", "TEXT"],
  ["edges", "description", "TEXT NOT NULL DEFAULT ''"],
  ["edges", "intent", "TEXT NOT NULL DEFAULT ''"],
  ["edges", "status", "TEXT"],
  ["graph_edges", "route", "TEXT"],
];

export const openGraphStore = (path: string, vocabulary: Vocabulary = DEFAULT_VOCABULARY) => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run("PRAGMA foreign_keys = ON");
  db.exec(SCHEMA);
  for (const [table, column, definition] of ADDED_COLUMNS) {
    const columns = db.query<{ name: string }, []>(`PRAGMA table_info(${table})`).all();
    if (!columns.some(({ name }) => name === column)) db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
  db.run("DELETE FROM edges WHERE id NOT IN (SELECT edge_id FROM graph_edges)");
  db.run("DELETE FROM nodes WHERE id NOT IN (SELECT node_id FROM graph_nodes)");

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

  const checkDesign = (errors: string[]) => {
    if (errors.length > 0) throw new StoreError(errors.join(" "), 400);
  };

  const touchGraph = (graphId: string) =>
    db.query("UPDATE graphs SET updated_at = $now WHERE id = $graphId").run({ graphId, now: now() });

  // A route fits only the node positions of the layout that made it. When a node moves, the routes of its edges in that
  // graph are removed, and the editor draws those edges as direct lines.
  const moveNode = db.query("UPDATE graph_nodes SET x = $x, y = $y WHERE graph_id = $graphId AND node_id = $nodeId");

  const clearRoutesOfNode = (graphId: string, nodeId: string) =>
    db
      .query(
        `UPDATE graph_edges SET route = NULL WHERE graph_id = $graphId AND route IS NOT NULL
         AND edge_id IN (SELECT id FROM edges WHERE source = $nodeId OR target = $nodeId)`,
      )
      .run({ graphId, nodeId });

  const createNode = (input: NodeInput, id: string = crypto.randomUUID()) => {
    checkDesign(nodeDesignErrors(vocabulary, input));
    const stamp = now();
    db.query(
      `INSERT INTO nodes (id, name, description, type, intent, status, labels, properties, created_at, updated_at)
       VALUES ($id, $name, $description, $type, $intent, $status, $labels, $properties, $stamp, $stamp)`,
    ).run({
      id,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      type: input.type ?? null,
      intent: input.intent?.trim() ?? "",
      status: input.status ?? null,
      labels: JSON.stringify(normalizeLabels(input.labels ?? [])),
      properties: JSON.stringify(input.properties ?? {}),
      stamp,
    });
    return requireNode(id);
  };

  const updateNode = (id: string, input: Partial<NodeInput>) => {
    const node = requireNode(id);
    checkDesign(nodeDesignErrors(vocabulary, input));
    db.query(
      `UPDATE nodes SET name = $name, description = $description, type = $type, intent = $intent, status = $status,
       labels = $labels, properties = $properties, updated_at = $now WHERE id = $id`,
    ).run({
      id,
      name: input.name?.trim() ?? node.name,
      description: input.description?.trim() ?? node.description,
      type: input.type !== undefined ? input.type : node.type,
      intent: input.intent?.trim() ?? node.intent,
      status: input.status !== undefined ? input.status : node.status,
      labels: JSON.stringify(normalizeLabels(input.labels ?? node.labels)),
      properties: JSON.stringify(input.properties ?? node.properties),
      now: now(),
    });
    return requireNode(id);
  };

  const createEdge = (input: EdgeInput, id: string = crypto.randomUUID()) => {
    requireNode(input.source);
    requireNode(input.target);
    checkDesign(edgeDesignErrors(vocabulary, input));
    const stamp = now();
    db.query(
      `INSERT INTO edges (id, source, target, directed, type, label, description, intent, status, properties, created_at, updated_at)
       VALUES ($id, $source, $target, $directed, $type, $label, $description, $intent, $status, $properties, $stamp, $stamp)`,
    ).run({
      id,
      source: input.source,
      target: input.target,
      directed: input.directed ?? true ? 1 : 0,
      type: input.type ?? null,
      label: input.label?.trim() ?? "",
      description: input.description?.trim() ?? "",
      intent: input.intent?.trim() ?? "",
      status: input.status ?? null,
      properties: JSON.stringify(input.properties ?? {}),
      stamp,
    });
    return requireEdge(id);
  };

  const updateEdge = (id: string, input: Partial<EdgeInput>) => {
    const edge = requireEdge(id);
    if (input.source !== undefined) requireNode(input.source);
    if (input.target !== undefined) requireNode(input.target);
    checkDesign(edgeDesignErrors(vocabulary, input));
    db.query(
      `UPDATE edges SET source = $source, target = $target, directed = $directed, type = $type, label = $label, description = $description,
       intent = $intent, status = $status, properties = $properties, updated_at = $now WHERE id = $id`,
    ).run({
      id,
      source: input.source ?? edge.source,
      target: input.target ?? edge.target,
      directed: input.directed ?? edge.directed ? 1 : 0,
      type: input.type !== undefined ? input.type : edge.type,
      label: input.label?.trim() ?? edge.label,
      description: input.description?.trim() ?? edge.description,
      intent: input.intent?.trim() ?? edge.intent,
      status: input.status !== undefined ? input.status : edge.status,
      properties: JSON.stringify(input.properties ?? edge.properties),
      now: now(),
    });
    db.query(
      `DELETE FROM graph_edges WHERE edge_id = $id AND NOT (
        EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.graph_id = graph_edges.graph_id AND gn.node_id = $source)
        AND EXISTS (SELECT 1 FROM graph_nodes gn WHERE gn.graph_id = graph_edges.graph_id AND gn.node_id = $target)
      )`,
    ).run({ id, source: input.source ?? edge.source, target: input.target ?? edge.target });
    if ((input.source ?? edge.source) !== edge.source || (input.target ?? edge.target) !== edge.target) {
      db.query("UPDATE graph_edges SET route = NULL WHERE edge_id = $id").run({ id });
    }
    return requireEdge(id);
  };

  const placeNode = (graphId: string, nodeId: string, position: Position | null, includeEdges: boolean) => {
    requireGraph(graphId);
    requireNode(nodeId);
    db.query(
      `INSERT INTO graph_nodes (graph_id, node_id, x, y) VALUES ($graphId, $nodeId, $x, $y)
       ON CONFLICT (graph_id, node_id) DO UPDATE SET x = excluded.x, y = excluded.y`,
    ).run({ graphId, nodeId, x: position?.x ?? null, y: position?.y ?? null });
    clearRoutesOfNode(graphId, nodeId);
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

  const dropOrphanEdge = (id: string) =>
    db.query("DELETE FROM edges WHERE id = $id AND NOT EXISTS (SELECT 1 FROM graph_edges WHERE edge_id = $id)").run({ id });

  const dropOrphanNode = (id: string) =>
    db.query("DELETE FROM nodes WHERE id = $id AND NOT EXISTS (SELECT 1 FROM graph_nodes WHERE node_id = $id)").run({ id });

  const inAnyGraph = db.query<{ found: number }, { id: string }>("SELECT 1 AS found FROM graph_edges WHERE edge_id = $id");

  const graphEdgeIds = db.query<{ edge_id: string }, { graphId: string }>("SELECT edge_id FROM graph_edges WHERE graph_id = $graphId");

  const detachEdge = (graphId: string, edgeId: string) => {
    db.query("DELETE FROM graph_edges WHERE graph_id = $graphId AND edge_id = $edgeId").run({ graphId, edgeId });
    dropOrphanEdge(edgeId);
  };

  const detachNode = (graphId: string, nodeId: string) => {
    const edgeIds = db
      .query<{ id: string }, { graphId: string; nodeId: string }>(
        "SELECT e.id FROM graph_edges ge JOIN edges e ON e.id = ge.edge_id WHERE ge.graph_id = $graphId AND (e.source = $nodeId OR e.target = $nodeId)",
      )
      .all({ graphId, nodeId });
    for (const { id } of edgeIds) detachEdge(graphId, id);
    db.query("DELETE FROM graph_nodes WHERE graph_id = $graphId AND node_id = $nodeId").run({ graphId, nodeId });
    dropOrphanNode(nodeId);
  };

  const flowsOf = db.query<FlowRow, { graphId: string }>("SELECT * FROM flows WHERE graph_id = $graphId ORDER BY created_at, rowid");
  const flowById = db.query<FlowRow, { id: string; graphId: string }>("SELECT * FROM flows WHERE id = $id AND graph_id = $graphId");

  const view = (graphId: string): GraphView => {
    const graph = requireGraph(graphId);
    const nodes = db
      .query<PlacedNodeRow, { graphId: string }>(
        "SELECT n.*, gn.x, gn.y FROM graph_nodes gn JOIN nodes n ON n.id = gn.node_id WHERE gn.graph_id = $graphId ORDER BY n.created_at, n.rowid",
      )
      .all({ graphId })
      .map((row) => ({ ...toNode(row), position: row.x == null || row.y == null ? null : { x: row.x, y: row.y } }));
    const edges = db
      .query<EdgeRow & { route: string | null }, { graphId: string }>(
        "SELECT e.*, ge.route FROM graph_edges ge JOIN edges e ON e.id = ge.edge_id WHERE ge.graph_id = $graphId ORDER BY e.created_at, e.rowid",
      )
      .all({ graphId })
      .map((row) => ({ ...toEdge(row), route: row.route == null ? null : (JSON.parse(row.route) as Position[]) }));
    return { graph, nodes, edges, flows: flowsOf.all({ graphId }).map(toFlow) };
  };

  const latestVersion = db.query<VersionRow & { snapshot: string }, { graphId: string }>(
    "SELECT * FROM graph_versions WHERE graph_id = $graphId ORDER BY version DESC LIMIT 1",
  );
  const versionByNumber = db.query<VersionRow & { snapshot: string }, { graphId: string; version: number }>(
    "SELECT * FROM graph_versions WHERE graph_id = $graphId AND version = $version",
  );

  const toVersion = (row: VersionRow & { snapshot: string }): GraphVersion => {
    const snapshot = JSON.parse(row.snapshot) as GraphView;
    return {
      ...toVersionSummary(row),
      view: {
        ...snapshot,
        nodes: snapshot.nodes.map((node) => ({ ...NODE_DESIGN_DEFAULTS, ...node })),
        edges: snapshot.edges.map((edge) => ({ ...EDGE_DESIGN_DEFAULTS, ...edge, route: edge.route ?? null })),
        flows: snapshot.flows ?? [],
      },
    };
  };

  const publish = db.transaction((graphId: string): GraphVersion => {
    const snapshot = view(graphId);
    const hash = contentHash(snapshot);
    const latest = latestVersion.get({ graphId });
    if (latest?.hash === hash) return toVersion(latest);
    const row = { graph_id: graphId, version: (latest?.version ?? 0) + 1, hash, snapshot: JSON.stringify(snapshot), published_at: now() };
    db.query(
      "INSERT INTO graph_versions (graph_id, version, hash, snapshot, published_at) VALUES ($graph_id, $version, $hash, $snapshot, $published_at)",
    ).run(row);
    return toVersion(row);
  });

  const getVersion = (graphId: string, version: number | "latest") => {
    const row = version === "latest" ? latestVersion.get({ graphId }) : versionByNumber.get({ graphId, version });
    if (row == null) throw new StoreError("The graph version does not exist.", 404);
    return toVersion(row);
  };

  const proposalById = db.query<ProposalRow, { id: string; graphId: string }>("SELECT * FROM proposals WHERE id = $id AND graph_id = $graphId");
  const graphPositions = db.query<{ node_id: string; x: number | null; y: number | null }, { graphId: string }>(
    "SELECT node_id, x, y FROM graph_nodes WHERE graph_id = $graphId",
  );
  const otherGraphs = db.query<{ name: string }, { nodeId: string; graphId: string }>(
    "SELECT g.name FROM graph_nodes gn JOIN graphs g ON g.id = gn.graph_id WHERE gn.node_id = $nodeId AND gn.graph_id != $graphId ORDER BY g.name COLLATE NOCASE",
  );

  const requireProposal = (graphId: string, proposalId: string) => {
    const row = proposalById.get({ id: proposalId, graphId });
    if (row == null) throw new StoreError("The proposal does not exist.", 404);
    return row;
  };

  const requireOpenProposal = (graphId: string, proposalId: string) => {
    const row = requireProposal(graphId, proposalId);
    if (row.status !== "open") throw new StoreError(`The proposal is ${row.status}. Only an open proposal can change.`, 409);
    return row;
  };

  const toProposal = (row: ProposalRow): Proposal => {
    const content = toContent(JSON.parse(row.content) as GraphContent);
    const sharedWith = Object.fromEntries(
      content.nodes
        .map(({ id }) => [id, otherGraphs.all({ nodeId: id, graphId: row.graph_id }).map(({ name }) => name)] as const)
        .filter(([, names]) => names.length > 0),
    );
    return { ...toProposalSummary(row), content, sharedWith };
  };

  const proposedContent = (graphId: string, input: ProposalInput): GraphContent => {
    const graph = requireGraph(graphId);
    const positions = new Map(
      graphPositions.all({ graphId }).map(({ node_id, x, y }) => [node_id, x == null || y == null ? null : { x, y }] as const),
    );
    const nodeIds = new Set<string>();
    const nodes = input.nodes.map((proposed): ContentNode => {
      if (nodeIds.has(proposed.id)) throw new StoreError(`The proposal has two nodes with the id ${proposed.id}.`, 400);
      nodeIds.add(proposed.id);
      const row = nodeById.get({ id: proposed.id });
      const existing = row == null ? null : toNode(row);
      const name = proposed.name ?? existing?.name;
      if (name == null) throw new StoreError(`The new node ${proposed.id} needs a name.`, 400);
      checkDesign(nodeDesignErrors(vocabulary, proposed).map((error) => `${proposed.id}: ${error}`));
      return {
        id: proposed.id,
        name,
        description: proposed.description?.trim() ?? existing?.description ?? "",
        type: proposed.type !== undefined ? proposed.type : (existing?.type ?? null),
        intent: proposed.intent?.trim() ?? existing?.intent ?? "",
        status: proposed.status !== undefined ? proposed.status : (existing?.status ?? null),
        labels: normalizeLabels(proposed.labels ?? existing?.labels ?? []),
        properties: proposed.properties ?? existing?.properties ?? {},
        position: proposed.position !== undefined ? proposed.position : (positions.get(proposed.id) ?? null),
      };
    });
    const edgeIds = new Set<string>();
    const edges = input.edges.map((proposed): ContentEdge => {
      if (edgeIds.has(proposed.id)) throw new StoreError(`The proposal has two edges with the id ${proposed.id}.`, 400);
      edgeIds.add(proposed.id);
      const row = edgeById.get({ id: proposed.id });
      const existing = row == null ? null : toEdge(row);
      const source = proposed.source ?? existing?.source;
      const target = proposed.target ?? existing?.target;
      if (source == null || target == null) throw new StoreError(`The new edge ${proposed.id} needs a source and a target.`, 400);
      if (!nodeIds.has(source) || !nodeIds.has(target)) {
        throw new StoreError(`The edge ${proposed.id} connects a node that is not in the proposal.`, 400);
      }
      checkDesign(edgeDesignErrors(vocabulary, proposed).map((error) => `${proposed.id}: ${error}`));
      return {
        id: proposed.id,
        source,
        target,
        directed: proposed.directed ?? existing?.directed ?? true,
        type: proposed.type !== undefined ? proposed.type : (existing?.type ?? null),
        label: proposed.label?.trim() ?? existing?.label ?? "",
        description: proposed.description?.trim() ?? existing?.description ?? "",
        intent: proposed.intent?.trim() ?? existing?.intent ?? "",
        status: proposed.status !== undefined ? proposed.status : (existing?.status ?? null),
        properties: proposed.properties ?? existing?.properties ?? {},
      };
    });
    return {
      graph: { name: input.graph?.name ?? graph.name, description: input.graph?.description ?? graph.description },
      nodes,
      edges,
    };
  };

  const createProposal = (graphId: string, input: ProposalInput) => {
    const content = proposedContent(graphId, input);
    const id = crypto.randomUUID();
    const stamp = now();
    db.query(
      `INSERT INTO proposals (id, graph_id, title, rationale, work_item, status, base_version, content, created_at, updated_at)
       VALUES ($id, $graphId, $title, $rationale, $workItem, 'open', $baseVersion, $content, $stamp, $stamp)`,
    ).run({
      id,
      graphId,
      title: input.title,
      rationale: input.rationale?.trim() ?? "",
      workItem: input.workItem?.trim() ?? "",
      baseVersion: latestVersion.get({ graphId })?.version ?? null,
      content: JSON.stringify(content),
      stamp,
    });
    return toProposal(requireProposal(graphId, id));
  };

  const reviseProposal = (graphId: string, proposalId: string, input: ProposalInput) => {
    requireOpenProposal(graphId, proposalId);
    const content = proposedContent(graphId, input);
    db.query(
      `UPDATE proposals SET title = $title, rationale = $rationale, work_item = $workItem, base_version = $baseVersion, content = $content, updated_at = $now
       WHERE id = $id`,
    ).run({
      id: proposalId,
      title: input.title,
      rationale: input.rationale?.trim() ?? "",
      workItem: input.workItem?.trim() ?? "",
      baseVersion: latestVersion.get({ graphId })?.version ?? null,
      content: JSON.stringify(content),
      now: now(),
    });
    return toProposal(requireProposal(graphId, proposalId));
  };

  const setStatus = (proposalId: string, status: ProposalSummary["status"]) =>
    db.query("UPDATE proposals SET status = $status, updated_at = $now WHERE id = $id").run({ id: proposalId, status, now: now() });

  const discardProposal = (graphId: string, proposalId: string) => {
    requireOpenProposal(graphId, proposalId);
    setStatus(proposalId, "discarded");
    return toProposal(requireProposal(graphId, proposalId));
  };

  // Makes the draft of a graph equal to the content. Nodes and edges with an existing id keep it and change. Others are
  // new: with keepIds they get the id from the content (to restore a node or an edge that an undo brings back), and
  // without it they get a new id (a proposal uses its own keys for new items). Returns the content with the final ids.
  const applyContent = (graphId: string, { graph, nodes, edges }: GraphContent, keepIds: boolean): GraphContent => {
    const current = view(graphId);
    if (graph.name !== current.graph.name || graph.description !== current.graph.description) {
      uniqueName(() =>
        db
          .query("UPDATE graphs SET name = $name, description = $description, updated_at = $now WHERE id = $graphId")
          .run({ graphId, name: graph.name, description: graph.description, now: now() }),
      );
    }
    const nodeIds = new Map<string, string>();
    for (const node of nodes) {
      const row = nodeById.get({ id: node.id });
      const id = row == null ? createNode(node, keepIds ? node.id : undefined).id : node.id;
      if (row != null && !sameNode(toNode(row), node)) updateNode(id, node);
      nodeIds.set(node.id, id);
      placeNode(graphId, id, node.position, false);
    }
    const keptNodes = new Set(nodeIds.values());
    for (const node of current.nodes) if (!keptNodes.has(node.id)) detachNode(graphId, node.id);
    const appliedEdges = edges.map((edge) => {
      const input = { ...edge, source: nodeIds.get(edge.source) ?? edge.source, target: nodeIds.get(edge.target) ?? edge.target };
      const row = edgeById.get({ id: edge.id });
      const id = row == null ? createEdge(input, keepIds ? edge.id : undefined).id : edge.id;
      if (row != null && !sameEdge(toEdge(row), input)) updateEdge(id, input);
      includeEdge(graphId, id);
      return { ...input, id };
    });
    const keptEdges = new Set(appliedEdges.map(({ id }) => id));
    for (const edge of view(graphId).edges) if (!keptEdges.has(edge.id)) detachEdge(graphId, edge.id);
    touchGraph(graphId);
    return { graph, nodes: nodes.map((node) => ({ ...node, id: nodeIds.get(node.id) ?? node.id })), edges: appliedEdges };
  };

  const applyProposal = db.transaction((graphId: string, proposalId: string, andPublish: boolean) => {
    const appliedContent = applyContent(graphId, toProposal(requireOpenProposal(graphId, proposalId)).content, false);
    db.query("UPDATE proposals SET content = $content WHERE id = $id").run({ id: proposalId, content: JSON.stringify(appliedContent) });
    setStatus(proposalId, "applied");
    return { proposal: toProposal(requireProposal(graphId, proposalId)), version: andPublish ? publish(graphId) : null };
  });

  // Puts the draft back to an earlier state that the editor kept, for undo and redo: its content, its positions and its
  // edge routes.
  const restoreDraft = db.transaction((graphId: string, { content, routes }: DraftState): GraphView => {
    requireGraph(graphId);
    applyContent(graphId, content, true);
    db.query("UPDATE graph_edges SET route = NULL WHERE graph_id = $graphId").run({ graphId });
    const setRoute = db.query("UPDATE graph_edges SET route = $route WHERE graph_id = $graphId AND edge_id = $edgeId");
    for (const [edgeId, points] of Object.entries(routes)) setRoute.run({ graphId, edgeId, route: JSON.stringify(points) });
    return view(graphId);
  });

  const requireFlow = (graphId: string, flowId: string) => {
    const row = flowById.get({ id: flowId, graphId });
    if (row == null) throw new StoreError("The flow does not exist.", 404);
    return toFlow(row);
  };

  // Each step after the first must follow an edge of the graph from the node of the step before. A step without an edge
  // takes the one edge that connects the two nodes in that direction.
  const checkSteps = (graphId: string, steps: NonNullable<FlowInput["steps"]>): FlowStep[] => {
    const { nodes, edges } = view(graphId);
    const names = new Map(nodes.map(({ id, name }) => [id, name]));
    const goesFrom = (edge: GraphEdge, from: string, to: string) =>
      (edge.source === from && edge.target === to) || (!edge.directed && edge.source === to && edge.target === from);
    return steps.map(({ nodeId, edgeId }, index): FlowStep => {
      const name = names.get(nodeId);
      if (name == null) throw new StoreError(`Step ${index + 1}: the node ${nodeId} is not in the graph.`, 400);
      const previous = steps[index - 1]?.nodeId;
      if (previous == null) {
        if (edgeId != null) throw new StoreError("Step 1: the first step has no edge.", 400);
        return { nodeId, edgeId: null };
      }
      const route = `${names.get(previous)} to ${name}`;
      if (edgeId != null) {
        const edge = edges.find(({ id }) => id === edgeId);
        if (edge == null) throw new StoreError(`Step ${index + 1}: the edge ${edgeId} is not in the graph.`, 400);
        if (!goesFrom(edge, previous, nodeId)) throw new StoreError(`Step ${index + 1}: the edge ${edgeId} does not go from ${route}.`, 400);
        return { nodeId, edgeId };
      }
      const found = edges.filter((edge) => goesFrom(edge, previous, nodeId));
      if (found.length === 0) throw new StoreError(`Step ${index + 1}: no edge goes from ${route}.`, 400);
      if (found.length > 1) throw new StoreError(`Step ${index + 1}: more than one edge goes from ${route}. Give the edgeId.`, 400);
      return { nodeId, edgeId: found[0]?.id ?? null };
    });
  };

  const createFlow = (graphId: string, input: FlowInput) => {
    requireGraph(graphId);
    const id = crypto.randomUUID();
    const stamp = now();
    db.query(
      `INSERT INTO flows (id, graph_id, name, description, steps, created_at, updated_at)
       VALUES ($id, $graphId, $name, $description, $steps, $stamp, $stamp)`,
    ).run({
      id,
      graphId,
      name: input.name.trim(),
      description: input.description?.trim() ?? "",
      steps: JSON.stringify(checkSteps(graphId, input.steps ?? [])),
      stamp,
    });
    touchGraph(graphId);
    return requireFlow(graphId, id);
  };

  const updateFlow = (graphId: string, flowId: string, input: Partial<FlowInput>) => {
    const flow = requireFlow(graphId, flowId);
    db.query("UPDATE flows SET name = $name, description = $description, steps = $steps, updated_at = $now WHERE id = $id").run({
      id: flowId,
      name: input.name?.trim() ?? flow.name,
      description: input.description?.trim() ?? flow.description,
      steps: JSON.stringify(input.steps != null ? checkSteps(graphId, input.steps) : flow.steps),
      now: now(),
    });
    touchGraph(graphId);
    return requireFlow(graphId, flowId);
  };

  const runById = db.query<RunRow, { id: string; graphId: string }>("SELECT * FROM runs WHERE id = $id AND graph_id = $graphId");

  const requireRun = (graphId: string, runId: string) => {
    const row = runById.get({ id: runId, graphId });
    if (row == null) throw new StoreError("The run does not exist.", 404);
    return toRun(row);
  };

  const requireRunning = (graphId: string, runId: string) => {
    const run = requireRun(graphId, runId);
    if (run.status !== "running") throw new StoreError(`The run is ${run.status}. Only a running run can change.`, 409);
    return run;
  };

  const flowOfVersion = (graphId: string, version: number, flowId: string) => {
    const flow = getVersion(graphId, version).view.flows.find(({ id }) => id === flowId);
    if (flow == null) throw new StoreError(`The flow is not in version ${version}. Publish the graph after you add the flow.`, 400);
    return flow;
  };

  const saveRun = db.query(
    "UPDATE runs SET status = $status, note = $note, events = $events, ended_at = $endedAt, updated_at = $now WHERE id = $id",
  );

  const startRun = (graphId: string, input: RunInput) => {
    requireGraph(graphId);
    const version = input.version ?? latestVersion.get({ graphId })?.version;
    if (version == null) throw new StoreError("The graph has no published version. Publish it before you start a run.", 409);
    const first = flowOfVersion(graphId, version, input.flowId).steps[0];
    if (first == null) throw new StoreError("The flow has no steps.", 400);
    const id = crypto.randomUUID();
    const stamp = now();
    db.query(
      `INSERT INTO runs (id, graph_id, version, flow_id, label, properties, events, started_at, updated_at)
       VALUES ($id, $graphId, $version, $flowId, $label, $properties, $events, $stamp, $stamp)`,
    ).run({
      id,
      graphId,
      version,
      flowId: input.flowId,
      label: input.label?.trim() ?? "",
      properties: JSON.stringify(input.properties ?? {}),
      events: JSON.stringify([{ step: 1, nodeId: first.nodeId, at: stamp, note: "" }]),
      stamp,
    });
    return requireRun(graphId, id);
  };

  const advanceRun = (graphId: string, runId: string, note: string) => {
    const run = requireRunning(graphId, runId);
    const steps = flowOfVersion(graphId, run.version, run.flowId).steps;
    const next = steps[run.events.length];
    if (next == null) throw new StoreError("The run is at the last step of its flow. Finish it.", 409);
    const stamp = now();
    const events = [...run.events, { step: run.events.length + 1, nodeId: next.nodeId, at: stamp, note: note.trim() }];
    saveRun.run({ id: runId, status: run.status, note: run.note, events: JSON.stringify(events), endedAt: null, now: stamp });
    return requireRun(graphId, runId);
  };

  const finishRun = (graphId: string, runId: string, { status, note }: FinishInput) => {
    const run = requireRunning(graphId, runId);
    const stamp = now();
    saveRun.run({ id: runId, status, note: note?.trim() ?? "", events: JSON.stringify(run.events), endedAt: stamp, now: stamp });
    return requireRun(graphId, runId);
  };

  const changeById = db.query<ChangeRow, { id: string }>("SELECT * FROM changes WHERE id = $id");

  const requireChange = (id: string) => {
    const row = changeById.get({ id });
    if (row == null) throw new StoreError("The change does not exist.", 404);
    return toChange(row);
  };

  const withIds = <T extends { id?: string | undefined }>(items: T[], what: string) => {
    const done = items.map((item) => ({ ...item, id: item.id ?? crypto.randomUUID() }));
    if (new Set(done.map(({ id }) => id)).size < done.length) throw new StoreError(`Two ${what} have the same id.`, 400);
    return done;
  };

  // The links of a change. Each link goes from an item to an item in the next view down. An idea item or a block must
  // be in the change. A node or a hunk can be missing, because the graph and the branch change on their own: the editor
  // shows such a link as broken.
  const checkLinks = (links: ChangeLink[], own: Set<string>) => {
    const seen = new Set<string>();
    return links.flatMap(({ from, to }, index) => {
      const link = linkBetween(from, to);
      if (typeof link === "string") throw new StoreError(`Link ${index + 1}: ${link}`, 400);
      if (link.from !== from) throw new StoreError(`Link ${index + 1}: from must be the item in the view above.`, 400);
      for (const ref of [from, to]) {
        const kind = parseRef(ref)?.kind;
        if ((kind === "idea" || kind === "pseudo") && !own.has(ref)) throw new StoreError(`Link ${index + 1}: the item ${ref} is not in the change.`, 400);
      }
      const key = `${from} ${to}`;
      if (seen.has(key)) return [];
      seen.add(key);
      return [{ from, to }];
    });
  };

  const saveChange = (id: string, input: Partial<ChangeInput>, stamp: string, before: Change | null) => {
    if (input.graphId != null) requireGraph(input.graphId);
    const ideas = input.ideas != null ? withIds(input.ideas, "idea items").map(({ id: itemId, text }) => ({ id: itemId, text: text.trim() })) : (before?.ideas ?? []);
    const blocks = input.blocks != null ? withIds(input.blocks, "blocks") : (before?.blocks ?? []);
    const own = new Set([...ideas.map(({ id: itemId }) => itemRef("idea", itemId)), ...blocks.map(({ id: itemId }) => itemRef("pseudo", itemId))]);
    const kept = (ref: string) => {
      const kind = parseRef(ref)?.kind;
      return (kind !== "idea" && kind !== "pseudo") || own.has(ref);
    };
    const links = input.links != null ? checkLinks(input.links, own) :(before?.links ?? []).filter(({ from, to }) => kept(from) && kept(to));
    db.query(
      `INSERT INTO changes (id, name, notes, graph_id, repo, base, branch, ideas, blocks, links, created_at, updated_at)
       VALUES ($id, $name, $notes, $graphId, $repo, $base, $branch, $ideas, $blocks, $links, $stamp, $stamp)
       ON CONFLICT(id) DO UPDATE SET name = $name, notes = $notes, graph_id = $graphId, repo = $repo, base = $base, branch = $branch,
         ideas = $ideas, blocks = $blocks, links = $links, updated_at = $stamp`,
    ).run({
      id,
      name: input.name?.trim() ?? before?.name ?? "",
      notes: input.notes ?? before?.notes ?? "",
      graphId: input.graphId === undefined ? (before?.graphId ?? null) : input.graphId,
      repo: input.repo?.trim() ?? before?.repo ?? "",
      base: input.base?.trim() ?? before?.base ?? "",
      branch: input.branch?.trim() ?? before?.branch ?? "",
      ideas: JSON.stringify(ideas),
      blocks: JSON.stringify(blocks),
      links: JSON.stringify(links),
      stamp,
    });
    return requireChange(id);
  };

  const diffProposal = (graphId: string, proposalId: string, against: number | "latest" | "draft") => {
    const proposal = toProposal(requireProposal(graphId, proposalId));
    if (against === "draft") return { against, diff: diffGraphs(toContent(view(graphId)), proposal.content) };
    if (against === "latest" && latestVersion.get({ graphId }) == null) {
      return { against: "empty" as const, diff: diffGraphs(EMPTY_CONTENT, proposal.content) };
    }
    const base = getVersion(graphId, against);
    return { against: base.version, diff: diffGraphs(toContent(base.view), proposal.content) };
  };

  return {
    vocabulary: () => vocabulary,

    listNodes: () => db.query<NodeRow, []>("SELECT * FROM nodes ORDER BY name COLLATE NOCASE").all().map(toNode),
    getNode: requireNode,
    updateNode,
    deleteNode: (id: string) => {
      requireNode(id);
      db.query("DELETE FROM nodes WHERE id = $id").run({ id });
    },

    listEdges: () => db.query<EdgeRow, []>("SELECT * FROM edges ORDER BY created_at, rowid").all().map(toEdge),
    getEdge: requireEdge,
    updateEdge: db.transaction((id: string, input: Partial<EdgeInput>) => {
      const edge = updateEdge(id, input);
      if (inAnyGraph.get({ id }) == null) {
        throw new StoreError("The edge would leave every graph. Both nodes must be in a graph that holds the edge.", 400);
      }
      return edge;
    }),
    deleteEdge: (id: string) => {
      requireEdge(id);
      db.query("DELETE FROM edges WHERE id = $id").run({ id });
    },

    listGraphs: (): GraphSummary[] =>
      db
        .query<GraphRow & { node_count: number; edge_count: number; open_proposals: number }, []>(
          `SELECT g.*,
            (SELECT COUNT(*) FROM graph_nodes WHERE graph_id = g.id) AS node_count,
            (SELECT COUNT(*) FROM graph_edges WHERE graph_id = g.id) AS edge_count,
            (SELECT COUNT(*) FROM proposals WHERE graph_id = g.id AND status = 'open') AS open_proposals
           FROM graphs g ORDER BY g.name COLLATE NOCASE`,
        )
        .all()
        .map((row) => {
          const latest = latestVersion.get({ graphId: row.id });
          return {
            ...toGraph(row),
            nodeCount: row.node_count,
            edgeCount: row.edge_count,
            published: latest?.version ?? null,
            changed: latest != null && latest.hash !== contentHash(view(row.id)),
            openProposals: row.open_proposals,
          };
        }),
    createGraph: (input: GraphInput, id: string = crypto.randomUUID()) => {
      const stamp = now();
      uniqueName(() =>
        db
          .query("INSERT INTO graphs (id, name, description, created_at, updated_at) VALUES ($id, $name, $description, $stamp, $stamp)")
          .run({ id, name: input.name.trim(), description: input.description.trim(), stamp }),
      );
      return requireGraph(id);
    },
    updateGraph: (id: string, input: GraphPatch) => {
      const graph = requireGraph(id);
      uniqueName(() =>
        db.query("UPDATE graphs SET name = $name, description = $description, direction = $direction, updated_at = $now WHERE id = $id").run({
          id,
          name: input.name?.trim() ?? graph.name,
          description: input.description?.trim() ?? graph.description,
          direction: input.direction ?? graph.direction,
          now: now(),
        }),
      );
      return requireGraph(id);
    },
    deleteGraph: db.transaction((id: string) => {
      requireGraph(id);
      const nodeIds = graphPositions.all({ graphId: id }).map(({ node_id }) => node_id);
      const edgeIds = graphEdgeIds.all({ graphId: id }).map(({ edge_id }) => edge_id);
      db.query("DELETE FROM graphs WHERE id = $id").run({ id });
      for (const edgeId of edgeIds) dropOrphanEdge(edgeId);
      for (const nodeId of nodeIds) dropOrphanNode(nodeId);
    }),
    view,

    publish,
    listVersions: (graphId: string) =>
      db
        .query<VersionRow, { graphId: string }>(
          "SELECT graph_id, version, hash, published_at FROM graph_versions WHERE graph_id = $graphId ORDER BY version DESC",
        )
        .all({ graphId })
        .map(toVersionSummary),
    getVersion,

    addNodeToGraph: db.transaction((graphId: string, nodeId: string, position: Position | null) => {
      placeNode(graphId, nodeId, position, true);
      return view(graphId);
    }),
    moveNodes: db.transaction((graphId: string, positions: Record<string, Position>) => {
      requireGraph(graphId);
      for (const [nodeId, { x, y }] of Object.entries(positions)) {
        moveNode.run({ graphId, nodeId, x, y });
        clearRoutesOfNode(graphId, nodeId);
      }
    }),
    setLayout: db.transaction((graphId: string, { positions, routes }: LayoutInput) => {
      requireGraph(graphId);
      for (const [nodeId, { x, y }] of Object.entries(positions)) moveNode.run({ graphId, nodeId, x, y });
      db.query("UPDATE graph_edges SET route = NULL WHERE graph_id = $graphId").run({ graphId });
      const setRoute = db.query("UPDATE graph_edges SET route = $route WHERE graph_id = $graphId AND edge_id = $edgeId");
      for (const [edgeId, points] of Object.entries(routes)) setRoute.run({ graphId, edgeId, route: JSON.stringify(points) });
    }),
    removeNodeFromGraph: db.transaction((graphId: string, nodeId: string) => {
      requireGraph(graphId);
      detachNode(graphId, nodeId);
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
    removeEdgeFromGraph: db.transaction((graphId: string, edgeId: string) => {
      requireGraph(graphId);
      detachEdge(graphId, edgeId);
      touchGraph(graphId);
    }),

    listFlows: (graphId: string) => {
      requireGraph(graphId);
      return flowsOf.all({ graphId }).map(toFlow);
    },
    getFlow: requireFlow,
    createFlow,
    updateFlow,
    deleteFlow: (graphId: string, flowId: string) => {
      requireFlow(graphId, flowId);
      db.query("DELETE FROM flows WHERE id = $id").run({ id: flowId });
      touchGraph(graphId);
    },

    listRuns: (graphId: string, flowId?: string) =>
      db
        .query<RunRow, { graphId: string; flowId: string | null }>(
          "SELECT * FROM runs WHERE graph_id = $graphId AND ($flowId IS NULL OR flow_id = $flowId) ORDER BY started_at DESC, rowid DESC",
        )
        .all({ graphId, flowId: flowId ?? null })
        .map(toRun),
    getRun: requireRun,
    startRun,
    advanceRun,
    finishRun,

    listProposals: (graphId: string) => {
      requireGraph(graphId);
      return db
        .query<ProposalRow, { graphId: string }>("SELECT * FROM proposals WHERE graph_id = $graphId ORDER BY created_at DESC, rowid DESC")
        .all({ graphId })
        .map(toProposalSummary);
    },
    getProposal: (graphId: string, proposalId: string) => toProposal(requireProposal(graphId, proposalId)),
    createProposal,
    reviseProposal,
    discardProposal,
    applyProposal,
    restoreDraft,
    diffProposal,

    listChanges: () => db.query<ChangeRow, []>("SELECT * FROM changes ORDER BY updated_at DESC, rowid DESC").all().map(toChange),
    getChange: requireChange,
    createChange: (input: ChangeInput) => saveChange(crypto.randomUUID(), input, now(), null),
    updateChange: (id: string, input: Partial<ChangeInput>) => saveChange(id, input, now(), requireChange(id)),
    deleteChange: (id: string) => {
      requireChange(id);
      db.query("DELETE FROM changes WHERE id = $id").run({ id });
    },
    diffChange: (id: string) => {
      const change = requireChange(id);
      try {
        return branchDiff(change.repo, change.base, change.branch);
      } catch (error) {
        if (error instanceof GitError) throw new StoreError(error.message, 400);
        throw error;
      }
    },

    close: () => db.close(),
  };
};

export type GraphStore = ReturnType<typeof openGraphStore>;
