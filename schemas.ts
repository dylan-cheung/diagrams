import { z } from "@hono/zod-openapi";
import { PSEUDO_LAYERS } from "./change-items.ts";

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

export const LayoutDirection = z
  .enum(["horizontal", "vertical"])
  .openapi("LayoutDirection", { description: "The direction in which auto layout places the nodes of the graph." });

export const Graph = z
  .object({
    id: Id,
    name: z.string().openapi({ example: "people" }),
    description: z.string().openapi({ example: "Who works with whom on the payments team." }),
    direction: LayoutDirection,
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Graph");

export const GraphSummary = Graph.extend({
  nodeCount: z.number().int(),
  edgeCount: z.number().int(),
  published: z.number().int().nullable().openapi({ description: "The latest published version, or null when the graph is not published." }),
  changed: z.boolean().openapi({ description: "The draft has changes that are not in the latest published version." }),
  openProposals: z.number().int().openapi({ description: "The number of open proposals." }),
}).openapi("GraphSummary");

export const PlacedNode = Node.extend({ position: Position.nullable() }).openapi("PlacedNode");

export const Route = z.array(Position).nullable().openapi("Route", {
  description:
    "The path of the edge in this graph from the last auto layout: the start point on the source node, the bend points, and the end point on the target node. It is null when the graph has no route for the edge, for example after one of its nodes moved. The editor then draws a direct line.",
  example: [
    { x: 110, y: 84 },
    { x: 110, y: 140 },
    { x: 260, y: 140 },
    { x: 260, y: 190 },
  ],
});

export const PlacedEdge = Edge.extend({ route: Route }).openapi("PlacedEdge");

export const FlowStep = z
  .object({
    nodeId: Id.openapi({ description: "The node that the flow is at in this step." }),
    edgeId: Id.nullable().openapi({ description: "The edge that the flow takes from the node of the step before to this node. It is null on the first step." }),
  })
  .openapi("FlowStep");

export const Flow = z
  .object({
    id: Id,
    graphId: Id,
    name: z.string().openapi({ example: "Caller has a claim number" }),
    description: z.string().openapi({ example: "The caller gives the claim number at once, so the lookup step is skipped." }),
    steps: z.array(FlowStep).openapi({ description: "The steps in order. A node can be in more than one step, for example in a loop." }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Flow", { description: "A sequence of steps through the graph: one specific path, for example the main path of a feature or an edge case." });

export const GraphView = z
  .object({ graph: Graph, nodes: z.array(PlacedNode), edges: z.array(PlacedEdge), flows: z.array(Flow) })
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

export const GraphPatch = GraphInput.partial().extend({ direction: LayoutDirection.optional() }).openapi("GraphPatch");

export const FlowStepInput = z
  .object({
    nodeId: z.string().min(1, { error: "A step needs a node." }).openapi({ description: "The id of a node in the graph." }),
    edgeId: z.string().min(1).nullable().optional().openapi({
      description:
        "The id of the edge from the node of the step before to this node. Omit it when exactly one edge in the graph connects the two nodes in that direction. The first step has no edge.",
    }),
  })
  .openapi("FlowStepInput");

export const FlowInput = z
  .object({
    name: Name("A flow needs a name."),
    description: z.string().optional().openapi({ example: "The caller gives the claim number at once, so the lookup step is skipped." }),
    steps: z.array(FlowStepInput).optional().openapi({ description: "The steps in order. Each step after the first must follow an edge of the graph." }),
  })
  .openapi("FlowInput");

export const FlowPatch = FlowInput.partial().openapi("FlowPatch");

export const RunStatus = z
  .enum(["running", "completed", "failed", "cancelled"])
  .openapi("RunStatus", { description: "running until the run finishes. Only a running run can move to its next step." });

export const RunEvent = z
  .object({
    step: z.number().int().positive().openapi({ description: "The step number in the flow, from 1.", example: 2 }),
    nodeId: Id.openapi({ description: "The node of that step." }),
    at: Timestamp.openapi({ description: "When the run reached the step." }),
    note: z.string().openapi({ example: "Caller gave the claim number." }),
  })
  .openapi("RunEvent");

export const Run = z
  .object({
    id: Id,
    graphId: Id,
    version: z.number().int().openapi({ description: "The published version that the run uses. Its flow and graph do not change.", example: 3 }),
    flowId: Id,
    label: z.string().openapi({ description: "A name for the run, for example the id of a call or a ticket.", example: "Call 4821" }),
    status: RunStatus,
    note: z.string().openapi({ description: "Why the run finished, when it finished.", example: "" }),
    properties: Metadata,
    events: z.array(RunEvent).openapi({ description: "The steps the run reached, in order. The last event is the current step." }),
    startedAt: Timestamp,
    endedAt: Timestamp.nullable(),
    updatedAt: Timestamp,
  })
  .openapi("Run", { description: "One instance of a flow: a record of one pass through its steps, on a published version." });

export const RunInput = z
  .object({
    flowId: z.string().min(1, { error: "A run needs a flow." }),
    version: z
      .number()
      .int()
      .positive()
      .optional()
      .openapi({ description: "The published version to run. The default is the latest version. The flow must be in that version." }),
    label: z.string().optional().openapi({ example: "Call 4821" }),
    properties: Metadata.optional(),
  })
  .openapi("RunInput");

export const AdvanceInput = z
  .object({ note: z.string().optional().openapi({ description: "What happened at the next step.", example: "Claim found." }) })
  .openapi("AdvanceInput");

export const FinishInput = z
  .object({
    status: z.enum(["completed", "failed", "cancelled"]).openapi({ example: "completed" }),
    note: z.string().optional().openapi({ example: "Payout sent." }),
  })
  .openapi("FinishInput");

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
    graph: GraphInput.partial().optional(),
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

export const LayoutInput = z
  .object({
    positions: Positions,
    routes: z.record(z.string(), z.array(Position)).openapi({ description: "The route of each edge, by edge id. Edges that are not in the list get no route." }),
  })
  .openapi("LayoutInput");

export const DraftState = z
  .object({
    content: GraphContent,
    routes: z.record(z.string(), z.array(Position)).openapi({ description: "The route of each edge, by edge id." }),
  })
  .openapi("DraftState", { description: "A state of the draft that the editor kept: its content with positions, and its edge routes." });

export const PseudoLayer = z
  .enum(PSEUDO_LAYERS, { error: `A layer is one of ${PSEUDO_LAYERS.join(", ")}.` })
  .openapi("PseudoLayer", { description: "The layer of the code that a pseudocode block is in." });

export const IdeaItem = z
  .object({ id: Id, text: z.string().openapi({ example: "Each node of a flow maps to an intended step." }) })
  .openapi("IdeaItem", { description: "One bullet point of the idea view." });

export const PseudoBlock = z
  .object({
    id: Id,
    layer: PseudoLayer,
    text: z.string().openapi({ example: "on canvas click: add step with intentId of the step before" }),
  })
  .openapi("PseudoBlock", { description: "One block of the pseudocode view, in one layer." });

export const ChangeLink = z
  .object({
    from: z.string().openapi({ description: "The item in the view above, as kind:id. The kind is idea, node or pseudo.", example: "idea:3f1c" }),
    to: z.string().openapi({ description: "The item in the view below, as kind:id. The kind is node, pseudo or hunk.", example: "node:6343537c-28f9-4dd8-943d-ef9abfb1fddf" }),
  })
  .openapi("ChangeLink", {
    description:
      "A trace link between an item in one view and an item in the next view down: an idea item to a node of the concept graph, a node to a pseudocode block, or a pseudocode block to a diff hunk.",
  });

export const Change = z
  .object({
    id: Id,
    name: z.string().openapi({ example: "Intended steps for flows" }),
    notes: z.string().openapi({ description: "The goal and the notes of the idea view, in prose." }),
    graphId: Id.nullable().openapi({ description: "The graph of the concept view. It is null until the change has one." }),
    repo: z.string().openapi({ description: "The local path of the git repository of the code view.", example: "/Users/me/Projects/diagram" }),
    base: z.string().openapi({ description: "The branch that the change starts from.", example: "main" }),
    branch: z.string().openapi({ description: "The branch of the change. The code view shows the diff from base to this branch.", example: "intended-steps" }),
    ideas: z.array(IdeaItem).openapi({ description: "The bullet points of the idea view, in order." }),
    blocks: z.array(PseudoBlock).openapi({ description: "The blocks of the pseudocode view, in order." }),
    links: z.array(ChangeLink),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Change", {
    description:
      "One change, in four views: the idea (notes and bullet points), the concepts (a graph), the pseudocode (blocks by layer) and the code (the diff of a branch). Trace links connect each item to the items in the next view that carry it out.",
  });

export const ChangeInput = z
  .object({
    name: Name("A change needs a name."),
    notes: z.string().optional(),
    graphId: z.string().min(1).nullable().optional().openapi({ description: "The id of a graph for the concept view." }),
    repo: z.string().optional(),
    base: z.string().optional(),
    branch: z.string().optional(),
    ideas: z
      .array(z.object({ id: z.string().trim().min(1).optional(), text: Name("An idea item needs text.") }))
      .optional()
      .openapi({ description: "Replaces all the idea items. Omit the id of a new item, and the server makes one. Links in the same request can use the id." }),
    blocks: z
      .array(z.object({ id: z.string().trim().min(1).optional(), layer: PseudoLayer, text: z.string() }))
      .optional()
      .openapi({ description: "Replaces all the pseudocode blocks. Omit the id of a new block, and the server makes one." }),
    links: z.array(ChangeLink).optional().openapi({ description: "Replaces all the links." }),
  })
  .openapi("ChangeInput", { description: "When an idea item or a block is removed, its links are removed too." });

export const ChangePatch = ChangeInput.partial().openapi("ChangePatch");

export const Feedback = z
  .object({
    id: Id,
    changeId: Id,
    text: z.string().openapi({ example: "The 409 message should also say how to stop the active assistant." }),
    ref: z.string().nullable().openapi({ description: "The item that the note is about, as kind:id (idea, node, pseudo or hunk). It is null for a note about the whole change.", example: "hunk:3fa9c21e07b4" }),
    done: z.boolean().openapi({ description: "True when the feedback is handled." }),
    createdAt: Timestamp,
    updatedAt: Timestamp,
  })
  .openapi("Feedback", { description: "One note of feedback on a change, for example from a review of its four views." });

export const FeedbackInput = z
  .object({
    text: Name("A note needs text."),
    ref: z.string().min(1).nullable().optional().openapi({ description: "The item that the note is about, as kind:id. Omit it for a note about the whole change." }),
    done: z.boolean().optional(),
  })
  .openapi("FeedbackInput");

export const FeedbackPatch = FeedbackInput.partial().openapi("FeedbackPatch");

export const DiffHunk = z
  .object({
    id: z.string().openapi({ description: "The id of the hunk: a hash of its file and its changed lines. It does not use line numbers, so it stays the same after a rebase." }),
    header: z.string().openapi({ example: "@@ -12,6 +12,8 @@ export const pathOf = (flow: Flow) => {" }),
    lines: z.array(z.string()).openapi({ description: "The lines of the hunk, each with its first character: + added, - removed, or a space." }),
  })
  .openapi("DiffHunk");

export const ChangeDiff = z
  .object({
    base: z.string(),
    branch: z.string(),
    files: z.array(z.object({ path: z.string(), hunks: z.array(DiffHunk) })),
  })
  .openapi("ChangeDiff", { description: "The diff of the branch of a change, from the point where it left the base branch." });

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
export type PlacedEdge = z.infer<typeof PlacedEdge>;
export type LayoutInput = z.infer<typeof LayoutInput>;
export type DraftState = z.infer<typeof DraftState>;
export type GraphView = z.infer<typeof GraphView>;
export type Flow = z.infer<typeof Flow>;
export type FlowStep = z.infer<typeof FlowStep>;
export type FlowInput = z.infer<typeof FlowInput>;
export type Run = z.infer<typeof Run>;
export type RunEvent = z.infer<typeof RunEvent>;
export type RunInput = z.infer<typeof RunInput>;
export type FinishInput = z.infer<typeof FinishInput>;
export type GraphVersionSummary = z.infer<typeof GraphVersionSummary>;
export type GraphVersion = z.infer<typeof GraphVersion>;
export type NodeInput = z.infer<typeof NodeInput>;
export type EdgeInput = z.infer<typeof EdgeInput>;
export type GraphInput = z.infer<typeof GraphInput>;
export type GraphPatch = z.infer<typeof GraphPatch>;
export type LayoutDirection = z.infer<typeof LayoutDirection>;
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
export type PseudoLayer = z.infer<typeof PseudoLayer>;
export type IdeaItem = z.infer<typeof IdeaItem>;
export type PseudoBlock = z.infer<typeof PseudoBlock>;
export type ChangeLink = z.infer<typeof ChangeLink>;
export type Change = z.infer<typeof Change>;
export type ChangeInput = z.infer<typeof ChangeInput>;
export type DiffHunk = z.infer<typeof DiffHunk>;
export type Feedback = z.infer<typeof Feedback>;
export type FeedbackInput = z.infer<typeof FeedbackInput>;
export type ChangeDiff = z.infer<typeof ChangeDiff>;
