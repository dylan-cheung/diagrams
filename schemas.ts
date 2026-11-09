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

const TypeId = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, { error: "A type id uses lowercase letters, digits and hyphens, and starts with a letter." });

const Term = z.object({
  id: TypeId.openapi({ example: "service" }),
  name: z.string().trim().min(1, { error: "A vocabulary term needs a name." }).openapi({ example: "Service" }),
  description: z.string().openapi({ example: "A deployable unit that runs on its own and serves requests." }),
});

const uniqueIds = (terms: { id: string }[]) => new Set(terms.map(({ id }) => id)).size === terms.length;

const Terms = (name: string) =>
  z.array(Term).refine(uniqueIds, { error: `Each ${name} needs a different id.` });

export const Vocabulary = z
  .object({
    nodeTypes: Terms("node type").openapi({ description: "The semantic types a node can have." }),
    relationshipTypes: Terms("relationship type").openapi({ description: "The semantic types an edge can have." }),
    statuses: Terms("lifecycle status").openapi({ description: "The lifecycle statuses a node or an edge can have." }),
  })
  .openapi("Vocabulary");

const NodeType = z.string().nullable().openapi({ description: "A node type id from GET /api/vocabulary, or null for no type.", example: "service" });

const RelationshipType = z
  .string()
  .nullable()
  .openapi({ description: "A relationship type id from GET /api/vocabulary, or null for no type.", example: "calls" });

const Status = z.string().nullable().openapi({ description: "A lifecycle status id from GET /api/vocabulary, or null for no status.", example: "active" });

const Intent = z.string().openapi({ description: "Why the element exists: the design goal it serves.", example: "Keep payment state in one place." });

const Metadata = Properties.openapi({ description: "Extensible metadata. Keys are free; values are strings, numbers, booleans or null." });

export const Position = z.object({ x: z.number(), y: z.number() }).openapi("Position", { example: { x: 40, y: 120 } });

export const Node = z
  .object({
    id: Id,
    name: z.string().openapi({ example: "Ada" }),
    description: z.string().openapi({ example: "Leads the payments team." }),
    type: NodeType,
    intent: Intent,
    status: Status,
    labels: Labels,
    properties: Metadata,
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
    type: RelationshipType,
    label: z.string().openapi({ example: "knows" }),
    description: z.string(),
    intent: Intent,
    status: Status,
    properties: Metadata,
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
    type: NodeType.optional(),
    intent: Intent.optional(),
    status: Status.optional(),
    labels: Labels.optional(),
    properties: Metadata.optional(),
  })
  .openapi("NodeInput");

export const NodePatch = NodeInput.partial().openapi("NodePatch");

export const NodeInGraphInput = NodeInput.extend({ position: Position.nullable().optional() }).openapi("NodeInGraphInput");

export const EdgeInput = z
  .object({
    source: z.string().min(1, { error: "An edge needs a source node." }),
    target: z.string().min(1, { error: "An edge needs a target node." }),
    directed: z.boolean().optional(),
    type: RelationshipType.optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    intent: Intent.optional(),
    status: Status.optional(),
    properties: Metadata.optional(),
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

export const ContentNode = z
  .object({
    id: Id,
    name: z.string(),
    description: z.string(),
    type: NodeType,
    intent: Intent,
    status: Status,
    labels: Labels,
    properties: Metadata,
    position: Position.nullable(),
  })
  .openapi("ContentNode");

export const ContentEdge = z
  .object({
    id: Id,
    source: Id,
    target: Id,
    directed: z.boolean(),
    type: RelationshipType,
    label: z.string(),
    description: z.string(),
    intent: Intent,
    status: Status,
    properties: Metadata,
  })
  .openapi("ContentEdge");

export const GraphContent = z
  .object({
    graph: z.object({ name: z.string(), description: z.string() }),
    nodes: z.array(ContentNode),
    edges: z.array(ContentEdge),
  })
  .openapi("GraphContent");

export const ProposedNode = z
  .object({
    id: z.string().trim().min(1, { error: "A proposed node needs an id." }).openapi({
      description: "The id of an existing node, or a new key for a new node. Omitted fields keep the value of the existing node.",
      example: "new-review-step",
    }),
    name: z.string().trim().min(1, { error: "A node needs a name." }).optional(),
    description: z.string().optional(),
    type: NodeType.optional(),
    intent: Intent.optional(),
    status: Status.optional(),
    labels: Labels.optional(),
    properties: Metadata.optional(),
    position: Position.nullable().optional(),
  })
  .openapi("ProposedNode");

export const ProposedEdge = z
  .object({
    id: z.string().trim().min(1, { error: "A proposed edge needs an id." }).openapi({
      description: "The id of an existing edge, or a new key for a new edge. Omitted fields keep the value of the existing edge.",
      example: "new-review-edge",
    }),
    source: z.string().min(1).optional().openapi({ description: "The id of a node in this proposal." }),
    target: z.string().min(1).optional().openapi({ description: "The id of a node in this proposal." }),
    directed: z.boolean().optional(),
    type: RelationshipType.optional(),
    label: z.string().optional(),
    description: z.string().optional(),
    intent: Intent.optional(),
    status: Status.optional(),
    properties: Metadata.optional(),
  })
  .openapi("ProposedEdge");

export const ProposalInput = z
  .object({
    title: Name("A proposal needs a title."),
    rationale: z.string().optional().openapi({ description: "Why the change is necessary.", example: "Callers with a claim number skip the lookup step." }),
    workItem: z.string().optional().openapi({ description: "The ticket, document or link the change is for.", example: "PROJ-12345" }),
    graph: GraphPatch.optional(),
    nodes: z.array(ProposedNode).openapi({ description: "Every node of the proposed graph. A node that is not in the list leaves the graph." }),
    edges: z.array(ProposedEdge).openapi({ description: "Every edge of the proposed graph. An edge that is not in the list leaves the graph." }),
  })
  .openapi("ProposalInput");

export const ProposalStatus = z.enum(["open", "applied", "discarded"]).openapi("ProposalStatus");

export const ProposalSummary = z
  .object({
    id: Id,
    graphId: Id,
    title: z.string(),
    rationale: z.string(),
    workItem: z.string(),
    status: ProposalStatus,
    baseVersion: z.number().int().nullable().openapi({ description: "The latest published version when the proposal was saved." }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("ProposalSummary");

export const Proposal = ProposalSummary.extend({
  content: GraphContent,
  sharedWith: z.record(z.string(), z.array(z.string())).openapi({
    description: "For each existing node in the proposal, the names of the other graphs that hold it. A change to the node applies there too.",
  }),
}).openapi("Proposal");

export const FieldChange = z
  .object({ field: z.string().openapi({ example: "properties.rule" }), before: z.unknown(), after: z.unknown() })
  .openapi("FieldChange");

export const ChangeStatus = z.enum(["added", "removed", "changed", "unchanged"]).openapi("ChangeStatus");

export const NodeChange = z
  .object({
    id: Id,
    status: ChangeStatus,
    before: ContentNode.nullable(),
    after: ContentNode.nullable(),
    fields: z.array(FieldChange),
    moved: z.boolean(),
  })
  .openapi("NodeChange");

export const EdgeChange = z
  .object({ id: Id, status: ChangeStatus, before: ContentEdge.nullable(), after: ContentEdge.nullable(), fields: z.array(FieldChange) })
  .openapi("EdgeChange");

export const GraphDiff = z
  .object({ graph: z.array(FieldChange), nodes: z.array(NodeChange), edges: z.array(EdgeChange) })
  .openapi("GraphDiff");

export const ProposalDiff = z
  .object({
    against: z.union([z.literal("draft"), z.literal("empty"), z.number().int()]).openapi({
      description: "The published version number, draft for the editable graph, or empty when the graph has no published version.",
    }),
    diff: GraphDiff,
  })
  .openapi("ProposalDiff");

export const ApplyInput = z
  .object({ publish: z.boolean().optional().openapi({ description: "Also publish a new version after the change." }) })
  .openapi("ApplyInput");

export const ApplyResult = z.object({ proposal: Proposal, version: GraphVersion.nullable() }).openapi("ApplyResult");

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
export type Vocabulary = z.infer<typeof Vocabulary>;
export type Term = Vocabulary["nodeTypes"][number];
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
export type ContentNode = z.infer<typeof ContentNode>;
export type ContentEdge = z.infer<typeof ContentEdge>;
export type GraphContent = z.infer<typeof GraphContent>;
export type ProposalInput = z.infer<typeof ProposalInput>;
export type ProposalSummary = z.infer<typeof ProposalSummary>;
export type Proposal = z.infer<typeof Proposal>;
export type FieldChange = z.infer<typeof FieldChange>;
export type ChangeStatus = z.infer<typeof ChangeStatus>;
export type NodeChange = z.infer<typeof NodeChange>;
export type EdgeChange = z.infer<typeof EdgeChange>;
export type GraphDiff = z.infer<typeof GraphDiff>;
