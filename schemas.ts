import { z } from "@hono/zod-openapi";

const Id = z.string().openapi({ example: "6343537c-28f9-4dd8-943d-ef9abfb1fddf" });

const Timestamp = z.string().openapi({ example: "2026-10-29T19:45:35.827Z" });

export const PropertyValue = z
  .union([z.string(), z.number(), z.boolean(), z.null()], {
    error: "Property values must be a string, number, boolean or null.",
  })
  .openapi("PropertyValue");

export const Properties = z
  .record(z.string().trim().min(1, { error: "A property needs a key." }), PropertyValue)
  .openapi("Properties", { example: { role: "engineer", since: 2019 } });

const Labels = z.array(z.string()).openapi({ example: ["Person"] });

export const Position = z.object({ x: z.number(), y: z.number() }).openapi("Position", { example: { x: 40, y: 120 } });

export const Node = z
  .object({
    id: Id,
    name: z.string().openapi({ example: "Ada" }),
    description: z.string().openapi({ example: "Leads the payments team." }),
    labels: Labels,
    properties: Properties,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Node");

export const Edge = z
  .object({
    id: Id,
    source: Id,
    target: Id,
    directed: z.boolean(),
    label: z.string().openapi({ example: "knows" }),
    properties: Properties,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Edge");

export const Graph = z
  .object({
    id: Id,
    name: z.string().openapi({ example: "people" }),
    description: z.string().openapi({ example: "Who works with whom on the payments team." }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Graph");

export const GraphSummary = Graph.extend({ nodeCount: z.number().int(), edgeCount: z.number().int() }).openapi("GraphSummary");

export const PlacedNode = Node.extend({ position: Position.nullable() }).openapi("PlacedNode");

export const GraphView = z
  .object({ graph: Graph, nodes: z.array(PlacedNode), edges: z.array(Edge) })
  .openapi("GraphView");

export const GraphVersionSummary = z
  .object({
    graphId: Id,
    version: z.number().int().openapi({ example: 3 }),
    hash: z.string().openapi({ example: "9f2c6b1e0d4a7f3c5e8b2a1d6c9f0e3b7a4d2c8e1f5b9a0c3d6e2f7b4a8c1d5e" }),
    publishedAt: Timestamp,
  })
  .openapi("GraphVersionSummary");

export const GraphVersion = GraphVersionSummary.extend({ view: GraphView }).openapi("GraphVersion");

const Name = (error: string) => z.string().trim().min(1, { error });

export const NodeInput = z
  .object({
    name: Name("A node needs a name."),
    description: z.string().optional().openapi({ example: "Leads the payments team." }),
    labels: Labels.optional(),
    properties: Properties.optional(),
  })
  .openapi("NodeInput");

export const NodePatch = NodeInput.partial().openapi("NodePatch");

export const NodeInGraphInput = NodeInput.extend({ position: Position.nullable().optional() }).openapi("NodeInGraphInput");

export const EdgeInput = z
  .object({
    source: z.string().min(1, { error: "An edge needs a source node." }),
    target: z.string().min(1, { error: "An edge needs a target node." }),
    directed: z.boolean().optional(),
    label: z.string().optional(),
    properties: Properties.optional(),
  })
  .openapi("EdgeInput");

export const EdgePatch = EdgeInput.partial().openapi("EdgePatch");

export const GraphInput = z
  .object({
    name: Name("A graph needs a name."),
    description: Name("A graph needs a description of its purpose.").openapi({ example: "Who works with whom on the payments team." }),
  })
  .openapi("GraphInput");

export const GraphPatch = GraphInput.partial().openapi("GraphPatch");

export const PlaceNodeInput = z.object({ position: Position.nullable().optional() }).openapi("PlaceNodeInput");

export const Positions = z.record(z.string(), Position).openapi("Positions", {
  example: { "6343537c-28f9-4dd8-943d-ef9abfb1fddf": { x: 40, y: 120 } },
});

export const ErrorBody = z
  .object({ errors: z.array(z.string()) })
  .openapi("Error", { example: { errors: ["The node does not exist."] } });

export type PropertyValue = z.infer<typeof PropertyValue>;
export type Properties = z.infer<typeof Properties>;
export type Position = z.infer<typeof Position>;
export type GraphNode = z.infer<typeof Node>;
export type GraphEdge = z.infer<typeof Edge>;
export type Graph = z.infer<typeof Graph>;
export type GraphSummary = z.infer<typeof GraphSummary>;
export type PlacedNode = z.infer<typeof PlacedNode>;
export type GraphView = z.infer<typeof GraphView>;
export type GraphVersionSummary = z.infer<typeof GraphVersionSummary>;
export type GraphVersion = z.infer<typeof GraphVersion>;
export type NodeInput = z.infer<typeof NodeInput>;
export type EdgeInput = z.infer<typeof EdgeInput>;
export type GraphInput = z.infer<typeof GraphInput>;
