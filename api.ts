import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { StoreError, type GraphStore } from "./db.ts";
import { createMcp } from "./mcp.ts";
import {
  AdvanceInput,
  ApplyInput,
  ApplyResult,
  Change,
  ChangeDiff,
  ChangeInput,
  ChangePatch,
  Feedback,
  FeedbackInput,
  FeedbackPatch,
  DraftState,
  Edge,
  EdgeInput,
  EdgePatch,
  ErrorBody,
  FinishInput,
  Flow,
  FlowInput,
  FlowPatch,
  Graph,
  GraphInput,
  GraphPatch,
  GraphSummary,
  GraphVersion,
  GraphVersionSummary,
  Group,
  GroupInput,
  GroupPatch,
  NodeInGraphPatch,
  GraphView,
  LayoutInput,
  Node,
  NodeInGraphInput,
  NodeInput,
  NodePatch,
  PlaceNodeInput,
  Positions,
  Proposal,
  ProposalDiff,
  ProposalInput,
  ProposalSummary,
  Run,
  RunInput,
  Vocabulary,
} from "./schemas.ts";

const pathParam = (name: string) => z.string().openapi({ param: { name, in: "path" } });

const IdParams = z.object({ id: pathParam("id") });
const GraphNodeParams = z.object({ id: pathParam("id"), nodeId: pathParam("nodeId") });
const GraphVersionParams = z.object({
  id: pathParam("id"),
  version: z
    .union([z.literal("latest"), z.coerce.number().int().positive()], { error: "The version must be a positive number or latest." })
    .openapi({ param: { name: "version", in: "path" }, example: 3 }),
});
const ProposalParams = z.object({ id: pathParam("id"), proposalId: pathParam("proposalId") });
const DiffQuery = z.object({
  against: z
    .union([z.literal("latest"), z.literal("draft"), z.coerce.number().int().positive()], {
      error: "against must be latest, draft or a positive version number.",
    })
    .optional()
    .openapi({ param: { name: "against", in: "query" }, example: "latest" }),
});
const FlowParams = z.object({ id: pathParam("id"), flowId: pathParam("flowId") });
const RunParams = z.object({ id: pathParam("id"), runId: pathParam("runId") });
const RunsQuery = z.object({ flowId: z.string().optional().openapi({ param: { name: "flowId", in: "query" }, description: "Only the runs of this flow." }) });
const FeedbackParams = z.object({ id: pathParam("id"), noteId: pathParam("noteId") });
const GroupParams = z.object({ id: pathParam("id"), groupId: pathParam("groupId") });
const GraphEdgeParams = z.object({ id: pathParam("id"), edgeId: pathParam("edgeId") });

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });

const errors = {
  400: json(ErrorBody, "The request is not valid."),
  404: json(ErrorBody, "A graph, node, edge, group, flow, run, proposal, change or note in the path does not exist."),
  409: json(ErrorBody, "The graph name is already used, the proposal is not open, or the run cannot change."),
};

const noContent = { 204: { description: "Done." } };

const route = <const T extends Parameters<typeof createRoute>[0]>(config: T) =>
  createRoute({ ...config, responses: { ...errors, ...config.responses } });

const tag = { vocabulary: ["Vocabulary"], nodes: ["Nodes"], edges: ["Edges"], graphs: ["Graphs"], membership: ["Graph membership"], versions: ["Graph versions"], flows: ["Flows"], groups: ["Groups"], runs: ["Runs"], proposals: ["Proposals"], changes: ["Changes"] };

export const createApi = (store: GraphStore) => {
  const app = new OpenAPIHono({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          {
            errors: result.error.issues.map((issue) =>
              issue.path.length > 0 && issue.code !== "too_small" ? `${issue.path.join(".")}: ${issue.message}` : issue.message,
            ),
          },
          400,
        );
      }
    },
  });

  app.onError((error, c) => {
    if (error instanceof StoreError) return c.json({ errors: [error.message] }, error.status);
    throw error;
  });

  const routes = app
    .openapi(
      route({
        method: "get",
        path: "/api/vocabulary",
        tags: tag.vocabulary,
        summary: "Get the design vocabulary",
        description:
          "The node types, relationship types and lifecycle statuses that nodes and edges can use. Requests that use an id that is not in the vocabulary fail with 400. The vocabulary describes meaning only; the editor chooses how each type looks.",
        responses: { 200: json(Vocabulary, "The vocabulary.") },
      }),
      (c) => c.json(store.vocabulary(), 200),
    )
    .openapi(
      route({ method: "get", path: "/api/nodes", tags: tag.nodes, summary: "List all nodes", responses: { 200: json(z.array(Node), "Every node, by name.") } }),
      (c) => c.json(store.listNodes(), 200),
    )
    .openapi(
      route({ method: "get", path: "/api/nodes/{id}", tags: tag.nodes, summary: "Get a node", request: { params: IdParams }, responses: { 200: json(Node, "The node.") } }),
      (c) => c.json(store.getNode(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/nodes/{id}",
        tags: tag.nodes,
        summary: "Update a node",
        request: { params: IdParams, ...body(NodePatch) },
        responses: { 200: json(Node, "The updated node.") },
      }),
      (c) => c.json(store.updateNode(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "delete",
        path: "/api/nodes/{id}",
        tags: tag.nodes,
        summary: "Delete a node",
        description: "Also deletes its edges, and removes both from every graph.",
        request: { params: IdParams },
        responses: noContent,
      }),
      (c) => {
        store.deleteNode(c.req.valid("param").id);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({ method: "get", path: "/api/edges", tags: tag.edges, summary: "List all edges", responses: { 200: json(z.array(Edge), "Every edge, oldest first.") } }),
      (c) => c.json(store.listEdges(), 200),
    )
    .openapi(
      route({ method: "get", path: "/api/edges/{id}", tags: tag.edges, summary: "Get an edge", request: { params: IdParams }, responses: { 200: json(Edge, "The edge.") } }),
      (c) => c.json(store.getEdge(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/edges/{id}",
        tags: tag.edges,
        summary: "Update an edge",
        description: "When a new endpoint is not in a graph, the edge leaves that graph. The change fails when the edge would leave every graph.",
        request: { params: IdParams, ...body(EdgePatch) },
        responses: { 200: json(Edge, "The updated edge.") },
      }),
      (c) => c.json(store.updateEdge(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({ method: "delete", path: "/api/edges/{id}", tags: tag.edges, summary: "Delete an edge", request: { params: IdParams }, responses: noContent }),
      (c) => {
        store.deleteEdge(c.req.valid("param").id);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({ method: "get", path: "/api/graphs", tags: tag.graphs, summary: "List graphs", responses: { 200: json(z.array(GraphSummary), "Every graph, by name, with counts.") } }),
      (c) => c.json(store.listGraphs(), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs",
        tags: tag.graphs,
        summary: "Create a graph",
        description: "A graph needs a name and a description of its purpose.",
        request: body(GraphInput),
        responses: { 200: json(Graph, "The new, empty graph.") },
      }),
      (c) => c.json(store.createGraph(c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}",
        tags: tag.graphs,
        summary: "Get a graph with its nodes and edges",
        request: { params: IdParams },
        responses: { 200: json(GraphView, "The graph, its nodes with positions, and its edges.") },
      }),
      (c) => c.json(store.view(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/graphs/{id}",
        tags: tag.graphs,
        summary: "Update a graph",
        description: "Changes its name, its description, or both.",
        request: { params: IdParams, ...body(GraphPatch) },
        responses: { 200: json(Graph, "The updated graph.") },
      }),
      (c) => c.json(store.updateGraph(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "delete",
        path: "/api/graphs/{id}",
        tags: tag.graphs,
        summary: "Delete a graph",
        description: "Also deletes its nodes and edges that no other graph holds.",
        request: { params: IdParams },
        responses: noContent,
      }),
      (c) => {
        store.deleteGraph(c.req.valid("param").id);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/nodes",
        tags: tag.membership,
        summary: "Create a node in a graph",
        description: "Every node belongs to a graph. This is the only way to create one.",
        request: { params: IdParams, ...body(NodeInGraphInput) },
        responses: { 200: json(Node, "The new node.") },
      }),
      (c) => {
        const { position, groupId, ...input } = c.req.valid("json");
        return c.json(store.createNodeInGraph(c.req.valid("param").id, input, position ?? null, groupId ?? null), 200);
      },
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/graphs/{id}/nodes/{nodeId}",
        tags: tag.membership,
        summary: "Put a node in a group of a graph",
        description: "Sets the group of the node in this graph only. A node is in at most one group of a graph. Set groupId to null to take it out of its group.",
        request: { params: GraphNodeParams, ...body(NodeInGraphPatch) },
        responses: { 200: json(GraphView, "The updated graph.") },
      }),
      (c) => {
        const { id, nodeId } = c.req.valid("param");
        return c.json(store.setNodeGroup(id, nodeId, c.req.valid("json").groupId), 200);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/groups",
        tags: tag.groups,
        summary: "Add a group to a graph",
        description:
          "A group is a named box with a description that holds a set of the nodes of one graph, for example the parts that one file defines. Give nodeIds to put nodes in it; a node that is in another group moves. GET /api/graphs/{id} returns the groups, and each node has its groupId.",
        request: { params: IdParams, ...body(GroupInput) },
        responses: { 200: json(Group, "The new group.") },
      }),
      (c) => c.json(store.createGroup(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/graphs/{id}/groups/{groupId}",
        tags: tag.groups,
        summary: "Change a group",
        description: "Omitted fields keep their value. nodeIds replaces all the nodes of the group.",
        request: { params: GroupParams, ...body(GroupPatch) },
        responses: { 200: json(Group, "The changed group.") },
      }),
      (c) => {
        const { id, groupId } = c.req.valid("param");
        return c.json(store.updateGroup(id, groupId, c.req.valid("json")), 200);
      },
    )
    .openapi(
      route({ method: "delete", path: "/api/graphs/{id}/groups/{groupId}", tags: tag.groups, summary: "Delete a group", description: "Its nodes stay in the graph, in no group.", request: { params: GroupParams }, responses: noContent }),
      (c) => {
        const { id, groupId } = c.req.valid("param");
        store.deleteGroup(id, groupId);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/nodes/{nodeId}",
        tags: tag.membership,
        summary: "Add an existing node to a graph",
        description: "Also adds its edges to nodes already in the graph. A null position lets the client place it.",
        request: { params: GraphNodeParams, ...body(PlaceNodeInput) },
        responses: { 200: json(GraphView, "The updated graph.") },
      }),
      (c) => {
        const { id, nodeId } = c.req.valid("param");
        return c.json(store.addNodeToGraph(id, nodeId, c.req.valid("json").position ?? null), 200);
      },
    )
    .openapi(
      route({
        method: "delete",
        path: "/api/graphs/{id}/nodes/{nodeId}",
        tags: tag.membership,
        summary: "Remove a node from a graph",
        description: "Also removes its edges from this graph. A node or an edge that no other graph holds is deleted.",
        request: { params: GraphNodeParams },
        responses: noContent,
      }),
      (c) => {
        const { id, nodeId } = c.req.valid("param");
        store.removeNodeFromGraph(id, nodeId);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/positions",
        tags: tag.membership,
        summary: "Move nodes in a graph",
        request: { params: IdParams, ...body(Positions) },
        responses: noContent,
      }),
      (c) => {
        store.moveNodes(c.req.valid("param").id, c.req.valid("json"));
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/layout",
        tags: tag.membership,
        summary: "Save a layout",
        description:
          "Saves the node positions and the edge routes of an auto layout in one step. Edges that are not in routes get no route. Moving a node later removes the routes of its edges in this graph.",
        request: { params: IdParams, ...body(LayoutInput) },
        responses: noContent,
      }),
      (c) => {
        store.setLayout(c.req.valid("param").id, c.req.valid("json"));
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/draft",
        tags: tag.membership,
        summary: "Restore the draft",
        description:
          "Makes the draft equal to an earlier state that the editor kept, for undo and redo: the graph name and purpose, the nodes with their positions, the edges, and the edge routes. A node or an edge that is not in the draft any more comes back with the same id. A change to a node or an edge applies in every graph that holds it.",
        request: { params: IdParams, ...body(DraftState) },
        responses: { 200: json(GraphView, "The restored draft.") },
      }),
      (c) => c.json(store.restoreDraft(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/edges",
        tags: tag.membership,
        summary: "Create an edge in a graph",
        description: "Every edge belongs to a graph. This is the only way to create one. Both nodes must already be in the graph. Loops and parallel edges are allowed. directed defaults to true.",
        request: { params: IdParams, ...body(EdgeInput) },
        responses: { 200: json(Edge, "The new edge.") },
      }),
      (c) => c.json(store.createEdgeInGraph(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/edges/{edgeId}",
        tags: tag.membership,
        summary: "Add an existing edge to a graph",
        description: "Both nodes must already be in the graph.",
        request: { params: GraphEdgeParams },
        responses: noContent,
      }),
      (c) => {
        const { id, edgeId } = c.req.valid("param");
        store.addEdgeToGraph(id, edgeId);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "delete",
        path: "/api/graphs/{id}/edges/{edgeId}",
        tags: tag.membership,
        summary: "Remove an edge from a graph",
        description: "An edge that no other graph holds is deleted.",
        request: { params: GraphEdgeParams },
        responses: noContent,
      }),
      (c) => {
        const { id, edgeId } = c.req.valid("param");
        store.removeEdgeFromGraph(id, edgeId);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/versions",
        tags: tag.versions,
        summary: "Publish a graph",
        description:
          "Saves a copy of the graph, its nodes and its edges that does not change. If nothing changed since the latest version, returns that version.",
        request: { params: IdParams },
        responses: { 200: json(GraphVersion, "The published version.") },
      }),
      (c) => c.json(store.publish(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/versions",
        tags: tag.versions,
        summary: "List the published versions of a graph",
        description: "Versions stay after the graph is deleted.",
        request: { params: IdParams },
        responses: { 200: json(z.array(GraphVersionSummary), "Every version, newest first.") },
      }),
      (c) => c.json(store.listVersions(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/versions/{version}",
        tags: tag.versions,
        summary: "Get a published version",
        description: "Use latest for the newest version.",
        request: { params: GraphVersionParams },
        responses: { 200: json(GraphVersion, "The version with its copy of the graph.") },
      }),
      (c) => {
        const { id, version } = c.req.valid("param");
        return c.json(store.getVersion(id, version), 200);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/flows",
        tags: tag.flows,
        summary: "List the flows of a graph",
        description:
          "A flow is a sequence of steps through the graph: one specific path, for example the main path of a feature or one of its edge cases. A graph can have many flows. GET /api/graphs/{id} also returns them.",
        request: { params: IdParams },
        responses: { 200: json(z.array(Flow), "Every flow of the draft, oldest first.") },
      }),
      (c) => c.json(store.listFlows(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/flows",
        tags: tag.flows,
        summary: "Add a flow to a graph",
        description:
          "Each step names a node of the graph. Each step after the first follows an edge from the node of the step before: give its edgeId, or omit it when exactly one edge connects the two nodes in that direction. An undirected edge goes both ways. A flow is part of the draft, so a publish saves it in the version.",
        request: { params: IdParams, ...body(FlowInput) },
        responses: { 200: json(Flow, "The new flow.") },
      }),
      (c) => c.json(store.createFlow(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/flows/{flowId}",
        tags: tag.flows,
        summary: "Get a flow",
        request: { params: FlowParams },
        responses: { 200: json(Flow, "The flow.") },
      }),
      (c) => {
        const { id, flowId } = c.req.valid("param");
        return c.json(store.getFlow(id, flowId), 200);
      },
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/graphs/{id}/flows/{flowId}",
        tags: tag.flows,
        summary: "Change a flow",
        description: "Omitted fields keep their value. steps replaces all the steps, with the same rules as when you add a flow.",
        request: { params: FlowParams, ...body(FlowPatch) },
        responses: { 200: json(Flow, "The changed flow.") },
      }),
      (c) => {
        const { id, flowId } = c.req.valid("param");
        return c.json(store.updateFlow(id, flowId, c.req.valid("json")), 200);
      },
    )
    .openapi(
      route({ method: "delete", path: "/api/graphs/{id}/flows/{flowId}", tags: tag.flows, summary: "Delete a flow", request: { params: FlowParams }, responses: noContent }),
      (c) => {
        const { id, flowId } = c.req.valid("param");
        store.deleteFlow(id, flowId);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/runs",
        tags: tag.runs,
        summary: "List the runs of a graph",
        description: "A run is one instance of a flow: one pass through its steps, on a published version. Runs stay after the graph is deleted.",
        request: { params: IdParams, query: RunsQuery },
        responses: { 200: json(z.array(Run), "Every run, newest first.") },
      }),
      (c) => c.json(store.listRuns(c.req.valid("param").id, c.req.valid("query").flowId), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/runs",
        tags: tag.runs,
        summary: "Start a run of a flow",
        description:
          "The run uses a published version (the latest by default), so the graph and the flow it follows do not change while it runs. The flow must be in that version. The run starts at step 1 of the flow.",
        request: { params: IdParams, ...body(RunInput) },
        responses: { 200: json(Run, "The new, running run.") },
      }),
      (c) => c.json(store.startRun(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({ method: "get", path: "/api/graphs/{id}/runs/{runId}", tags: tag.runs, summary: "Get a run", request: { params: RunParams }, responses: { 200: json(Run, "The run.") } }),
      (c) => {
        const { id, runId } = c.req.valid("param");
        return c.json(store.getRun(id, runId), 200);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/runs/{runId}/advance",
        tags: tag.runs,
        summary: "Move a run to its next step",
        description: "Records that the run reached the next step of its flow. A run at the last step must finish instead.",
        request: { params: RunParams, ...body(AdvanceInput) },
        responses: { 200: json(Run, "The run at its next step.") },
      }),
      (c) => {
        const { id, runId } = c.req.valid("param");
        return c.json(store.advanceRun(id, runId, c.req.valid("json").note ?? ""), 200);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/runs/{runId}/finish",
        tags: tag.runs,
        summary: "Finish a run",
        description: "Sets the final status: completed, failed or cancelled. A run can finish at any step. After that, it does not change.",
        request: { params: RunParams, ...body(FinishInput) },
        responses: { 200: json(Run, "The finished run.") },
      }),
      (c) => {
        const { id, runId } = c.req.valid("param");
        return c.json(store.finishRun(id, runId, c.req.valid("json")), 200);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/proposals",
        tags: tag.proposals,
        summary: "List the proposals for a graph",
        request: { params: IdParams },
        responses: { 200: json(z.array(ProposalSummary), "Every proposal, newest first.") },
      }),
      (c) => c.json(store.listProposals(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/proposals",
        tags: tag.proposals,
        summary: "Propose a change to a graph",
        description:
          "Saves a proposed version of the graph without changing the graph. Send the full proposed graph: every node and edge it must hold. Start from GET /api/graphs/{id} and change what you need. Use existing ids to keep or change existing nodes and edges, and new keys for new ones. Compare the proposal with GET .../diff, then apply it.",
        request: { params: IdParams, ...body(ProposalInput) },
        responses: { 200: json(Proposal, "The new, open proposal.") },
      }),
      (c) => c.json(store.createProposal(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/proposals/{proposalId}",
        tags: tag.proposals,
        summary: "Get a proposal",
        request: { params: ProposalParams },
        responses: { 200: json(Proposal, "The proposal with its proposed graph.") },
      }),
      (c) => {
        const { id, proposalId } = c.req.valid("param");
        return c.json(store.getProposal(id, proposalId), 200);
      },
    )
    .openapi(
      route({
        method: "put",
        path: "/api/graphs/{id}/proposals/{proposalId}",
        tags: tag.proposals,
        summary: "Revise an open proposal",
        description: "Replaces the proposed graph and its details. The base version becomes the latest published version.",
        request: { params: ProposalParams, ...body(ProposalInput) },
        responses: { 200: json(Proposal, "The revised proposal.") },
      }),
      (c) => {
        const { id, proposalId } = c.req.valid("param");
        return c.json(store.reviseProposal(id, proposalId, c.req.valid("json")), 200);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/graphs/{id}/proposals/{proposalId}/diff",
        tags: tag.proposals,
        summary: "Compare a proposal with a version of the graph",
        description:
          "Lists what the proposal adds, removes and changes. against is latest (the default) for the latest published version, a version number, or draft for the editable graph. Positions are not changes; a node that only moved has moved true.",
        request: { params: ProposalParams, query: DiffQuery },
        responses: { 200: json(ProposalDiff, "The changes from the base to the proposal.") },
      }),
      (c) => {
        const { id, proposalId } = c.req.valid("param");
        return c.json(store.diffProposal(id, proposalId, c.req.valid("query").against ?? "latest"), 200);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/proposals/{proposalId}/apply",
        tags: tag.proposals,
        summary: "Apply a proposal to the graph",
        description:
          "Makes the editable graph equal to the proposal, and replaces edits that are not published. A change to an existing node or edge applies in every graph that holds it. Set publish to also publish a new version.",
        request: { params: ProposalParams, ...body(ApplyInput) },
        responses: { 200: json(ApplyResult, "The applied proposal, and the new version when publish is set.") },
      }),
      (c) => {
        const { id, proposalId } = c.req.valid("param");
        return c.json(store.applyProposal(id, proposalId, c.req.valid("json").publish ?? false), 200);
      },
    )
    .openapi(
      route({
        method: "post",
        path: "/api/graphs/{id}/proposals/{proposalId}/discard",
        tags: tag.proposals,
        summary: "Discard a proposal",
        description: "The graph does not change. The proposal stays in the list as discarded.",
        request: { params: ProposalParams },
        responses: { 200: json(Proposal, "The discarded proposal.") },
      }),
      (c) => {
        const { id, proposalId } = c.req.valid("param");
        return c.json(store.discardProposal(id, proposalId), 200);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/changes",
        tags: tag.changes,
        summary: "List the changes",
        description:
          "A change has four views: the idea (notes and bullet points), the concepts (a graph), the pseudocode (blocks by layer) and the code (the diff of a git branch). Trace links connect each item to the items in the next view down that carry it out.",
        responses: { 200: json(z.array(Change), "Every change, the most recently changed first.") },
      }),
      (c) => c.json(store.listChanges(), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/changes",
        tags: tag.changes,
        summary: "Add a change",
        description:
          "Give the idea items and the blocks your own ids to link them in the same request. A link goes from an item to an item in the next view down: idea to node, node to pseudo, or pseudo to hunk. Items are kind:id, for example idea:intro or node:<node id>. The id of a hunk comes from GET /api/changes/{id}/diff.",
        request: { ...body(ChangeInput) },
        responses: { 200: json(Change, "The new change.") },
      }),
      (c) => c.json(store.createChange(c.req.valid("json")), 200),
    )
    .openapi(
      route({ method: "get", path: "/api/changes/{id}", tags: tag.changes, summary: "Get a change", request: { params: IdParams }, responses: { 200: json(Change, "The change.") } }),
      (c) => c.json(store.getChange(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/changes/{id}",
        tags: tag.changes,
        summary: "Change a change",
        description:
          "Omitted fields keep their value. ideas, blocks and links each replace the whole list. When an idea item or a block is removed, its links are removed too. Set graphId to null to remove the graph of the concept view.",
        request: { params: IdParams, ...body(ChangePatch) },
        responses: { 200: json(Change, "The changed change.") },
      }),
      (c) => c.json(store.updateChange(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({ method: "delete", path: "/api/changes/{id}", tags: tag.changes, summary: "Delete a change", description: "Its graph stays.", request: { params: IdParams }, responses: noContent }),
      (c) => {
        store.deleteChange(c.req.valid("param").id);
        return c.body(null, 204);
      },
    )
    .openapi(
      route({
        method: "get",
        path: "/api/changes/{id}/diff",
        tags: tag.changes,
        summary: "Get the code view of a change",
        description:
          "Runs git diff base...branch in the repository of the change: the changes on the branch since it left the base branch. Each hunk has an id that links can use. The repository does not change.",
        request: { params: IdParams },
        responses: { 200: json(ChangeDiff, "The files and hunks of the diff.") },
      }),
      (c) => c.json(store.diffChange(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "get",
        path: "/api/changes/{id}/feedback",
        tags: tag.changes,
        summary: "List the feedback on a change",
        description: "Notes of feedback that a reviewer collects while looking at a change. Each note is about the whole change or about one item (ref).",
        request: { params: IdParams },
        responses: { 200: json(z.array(Feedback), "Every note, oldest first.") },
      }),
      (c) => c.json(store.listFeedback(c.req.valid("param").id), 200),
    )
    .openapi(
      route({
        method: "post",
        path: "/api/changes/{id}/feedback",
        tags: tag.changes,
        summary: "Add a note of feedback",
        request: { params: IdParams, ...body(FeedbackInput) },
        responses: { 200: json(Feedback, "The new note.") },
      }),
      (c) => c.json(store.addFeedback(c.req.valid("param").id, c.req.valid("json")), 200),
    )
    .openapi(
      route({
        method: "patch",
        path: "/api/changes/{id}/feedback/{noteId}",
        tags: tag.changes,
        summary: "Change a note of feedback",
        description: "Omitted fields keep their value. Set done to mark the feedback as handled. Set ref to null to make the note about the whole change.",
        request: { params: FeedbackParams, ...body(FeedbackPatch) },
        responses: { 200: json(Feedback, "The changed note.") },
      }),
      (c) => {
        const { id, noteId } = c.req.valid("param");
        return c.json(store.updateFeedback(id, noteId, c.req.valid("json")), 200);
      },
    )
    .openapi(
      route({ method: "delete", path: "/api/changes/{id}/feedback/{noteId}", tags: tag.changes, summary: "Delete a note of feedback", request: { params: FeedbackParams }, responses: noContent }),
      (c) => {
        const { id, noteId } = c.req.valid("param");
        store.deleteFeedback(id, noteId);
        return c.body(null, 204);
      },
    );

  const doc = {
    openapi: "3.1.0",
    info: {
      title: "Diagram API",
      version: "4.4.0",
      description:
        "The API of Diagram, an app that keeps and edits graphs. It uses the labeled property graph model. Nodes and edges are shared entities. A graph is a named subgraph that holds nodes, their positions, and edges. Each node and edge can have a type and a status from the design vocabulary, a description (what it is) and an intent (why it exists). A group is a named box that holds a set of the nodes of one graph. A flow is a sequence of steps through a graph: one specific path, such as an edge case of a feature. A run is one instance of a flow on a published version. A published version is a copy of a graph, with its flows, that does not change. A proposal is a proposed graph that you compare with a version before you apply it. A change is one code change in four views (idea, concepts, pseudocode and code) with trace links between them. The Guide page of the app (/guide) explains each part.",
    },
  };
  app.doc31("/openapi.json", doc);
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "Diagram API", showDeveloperTools: "never" }));

  // The MCP server for Claude. Its tools call the routes above.
  const mcp = createMcp(app.getOpenAPI31Document(doc), (request) => app.fetch(request));
  app.all("/mcp", (c) => mcp(c.req.raw));

  return routes;
};

export type AppType = ReturnType<typeof createApi>;
