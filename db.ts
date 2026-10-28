import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createEmptyNodes, normalizeNode, type Graph, type GraphInput } from "./graph.ts";

type GraphRow = {
  id: string;
  name: string;
  type: string;
  nodes: string;
  created_at: string;
  updated_at: string;
};

export type GraphSummary = Pick<Graph, "_id" | "name" | "type" | "updatedAt"> & {
  nodeCount: number;
};

const toGraph = (row: GraphRow): Graph => ({
  _id: row.id,
  name: row.name,
  type: row.type,
  nodes: (JSON.parse(row.nodes) as Graph["nodes"]).map(normalizeNode),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export class DuplicateNameError extends Error {}

const isUniqueViolation = (error: unknown) =>
  error instanceof Error && error.message.includes("UNIQUE constraint failed");

export const openGraphStore = (path: string) => {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true, strict: true });
  db.run("PRAGMA journal_mode = WAL");
  db.run(`CREATE TABLE IF NOT EXISTS graphs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    nodes TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`);

  const selectAll = db.query<GraphRow, []>("SELECT * FROM graphs ORDER BY name COLLATE NOCASE");
  const selectOne = db.query<GraphRow, { id: string }>("SELECT * FROM graphs WHERE id = $id");
  const insert = db.query(
    "INSERT INTO graphs (id, name, type, nodes, created_at, updated_at) VALUES ($id, $name, $type, $nodes, $now, $now)",
  );
  const update = db.query(
    "UPDATE graphs SET name = $name, type = $type, nodes = $nodes, updated_at = $now WHERE id = $id",
  );
  const remove = db.query("DELETE FROM graphs WHERE id = $id");

  const write = <T>(action: () => T) => {
    try {
      return action();
    } catch (error) {
      if (isUniqueViolation(error)) throw new DuplicateNameError("A graph with this name already exists.");
      throw error;
    }
  };

  return {
    list: (): GraphSummary[] =>
      selectAll.all().map((row) => {
        const graph = toGraph(row);
        return {
          _id: graph._id,
          name: graph.name,
          type: graph.type,
          updatedAt: graph.updatedAt,
          nodeCount: graph.nodes.length,
        };
      }),
    get: (id: string) => {
      const row = selectOne.get({ id });
      return row == null ? null : toGraph(row);
    },
    create: (input: Pick<GraphInput, "name" | "type"> & Partial<Pick<GraphInput, "nodes">>) => {
      const id = crypto.randomUUID();
      write(() =>
        insert.run({
          id,
          name: input.name.trim(),
          type: input.type.trim(),
          nodes: JSON.stringify((input.nodes ?? createEmptyNodes()).map(normalizeNode)),
          now: new Date().toISOString(),
        }),
      );
      return toGraph(selectOne.get({ id }) as GraphRow);
    },
    update: (id: string, input: GraphInput) => {
      const result = write(() =>
        update.run({
          id,
          name: input.name.trim(),
          type: input.type.trim(),
          nodes: JSON.stringify(input.nodes.map(normalizeNode)),
          now: new Date().toISOString(),
        }),
      );
      return result.changes === 0 ? null : toGraph(selectOne.get({ id }) as GraphRow);
    },
    remove: (id: string) => remove.run({ id }).changes > 0,
    close: () => db.close(),
  };
};

export type GraphStore = ReturnType<typeof openGraphStore>;
