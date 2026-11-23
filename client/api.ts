import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "../api.ts";
import type { ChangeInput, FeedbackInput, DraftState, EdgeInput, FinishInput, FlowInput, GraphInput, GraphPatch, GroupInput, LayoutInput, NodeInput, Position } from "../model.ts";

export class ApiError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
  }
}

type Success<R> = R extends ClientResponse<infer T, infer S, string> ? (S extends 200 ? T : S extends 204 ? undefined : never) : never;

const unwrap = async <R extends ClientResponse<unknown, number, string>>(request: Promise<R>): Promise<Success<R>> => {
  const res = await request;
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { errors?: string[] };
    throw new ApiError(body.errors ?? [`Request failed with ${res.status}.`]);
  }
  return (res.status === 204 ? undefined : await res.json()) as Success<R>;
};

const client = hc<AppType>("/");
const nodes = client.api.nodes;
const edges = client.api.edges;
const graphs = client.api.graphs;
const changes = client.api.changes;

export const api = {
  vocabulary: () => unwrap(client.api.vocabulary.$get()),
  listGraphs: () => unwrap(graphs.$get()),
  createGraph: (input: GraphInput) => unwrap(graphs.$post({ json: input })),
  updateGraph: (id: string, input: GraphPatch) => unwrap(graphs[":id"].$patch({ param: { id }, json: input })),
  deleteGraph: (id: string) => unwrap(graphs[":id"].$delete({ param: { id } })),
  view: (id: string) => unwrap(graphs[":id"].$get({ param: { id } })),
  publish: (id: string) => unwrap(graphs[":id"].versions.$post({ param: { id } })),
  listVersions: (id: string) => unwrap(graphs[":id"].versions.$get({ param: { id } })),
  getVersion: (id: string, version: number | "latest") =>
    unwrap(graphs[":id"].versions[":version"].$get({ param: { id, version: String(version) } })),

  createFlow: (id: string, input: FlowInput) => unwrap(graphs[":id"].flows.$post({ param: { id }, json: input })),
  updateFlow: (id: string, flowId: string, input: Partial<FlowInput>) =>
    unwrap(graphs[":id"].flows[":flowId"].$patch({ param: { id, flowId }, json: input })),
  deleteFlow: (id: string, flowId: string) => unwrap(graphs[":id"].flows[":flowId"].$delete({ param: { id, flowId } })),

  listRuns: (id: string) => unwrap(graphs[":id"].runs.$get({ param: { id }, query: {} })),
  startRun: (id: string, flowId: string, version: number) => unwrap(graphs[":id"].runs.$post({ param: { id }, json: { flowId, version } })),
  advanceRun: (id: string, runId: string, note: string) =>
    unwrap(graphs[":id"].runs[":runId"].advance.$post({ param: { id, runId }, json: { note } })),
  finishRun: (id: string, runId: string, input: FinishInput) =>
    unwrap(graphs[":id"].runs[":runId"].finish.$post({ param: { id, runId }, json: input })),

  listProposals: (id: string) => unwrap(graphs[":id"].proposals.$get({ param: { id } })),
  getProposal: (id: string, proposalId: string) => unwrap(graphs[":id"].proposals[":proposalId"].$get({ param: { id, proposalId } })),
  diffProposal: (id: string, proposalId: string, against: number | "latest" | "draft") =>
    unwrap(graphs[":id"].proposals[":proposalId"].diff.$get({ param: { id, proposalId }, query: { against: String(against) } })),
  applyProposal: (id: string, proposalId: string, publish: boolean) =>
    unwrap(graphs[":id"].proposals[":proposalId"].apply.$post({ param: { id, proposalId }, json: { publish } })),
  discardProposal: (id: string, proposalId: string) =>
    unwrap(graphs[":id"].proposals[":proposalId"].discard.$post({ param: { id, proposalId } })),

  updateNode: (id: string, input: Partial<NodeInput>) => unwrap(nodes[":id"].$patch({ param: { id }, json: input })),

  updateEdge: (id: string, input: Partial<EdgeInput>) => unwrap(edges[":id"].$patch({ param: { id }, json: input })),

  createNodeInGraph: (id: string, input: NodeInput, position: Position | null) =>
    unwrap(graphs[":id"].nodes.$post({ param: { id }, json: { ...input, position } })),
  removeNodeFromGraph: (id: string, nodeId: string) =>
    unwrap(graphs[":id"].nodes[":nodeId"].$delete({ param: { id, nodeId } })),
  moveNodes: (id: string, positions: Record<string, Position>) =>
    unwrap(graphs[":id"].positions.$put({ param: { id }, json: positions })),
  restoreDraft: (id: string, state: DraftState) => unwrap(graphs[":id"].draft.$put({ param: { id }, json: state })),
  setLayout: (id: string, layout: LayoutInput) => unwrap(graphs[":id"].layout.$put({ param: { id }, json: layout })),
  setNodeGroup: (id: string, nodeId: string, groupId: string | null) =>
    unwrap(graphs[":id"].nodes[":nodeId"].$patch({ param: { id, nodeId }, json: { groupId } })),
  createGroup: (id: string, input: GroupInput) => unwrap(graphs[":id"].groups.$post({ param: { id }, json: input })),
  updateGroup: (id: string, groupId: string, input: Partial<GroupInput>) =>
    unwrap(graphs[":id"].groups[":groupId"].$patch({ param: { id, groupId }, json: input })),
  deleteGroup: (id: string, groupId: string) => unwrap(graphs[":id"].groups[":groupId"].$delete({ param: { id, groupId } })),
  createEdgeInGraph: (id: string, input: EdgeInput) => unwrap(graphs[":id"].edges.$post({ param: { id }, json: input })),
  removeEdgeFromGraph: (id: string, edgeId: string) =>
    unwrap(graphs[":id"].edges[":edgeId"].$delete({ param: { id, edgeId } })),

  listChanges: () => unwrap(changes.$get()),
  getChange: (id: string) => unwrap(changes[":id"].$get({ param: { id } })),
  createChange: (input: ChangeInput) => unwrap(changes.$post({ json: input })),
  updateChange: (id: string, input: Partial<ChangeInput>) => unwrap(changes[":id"].$patch({ param: { id }, json: input })),
  deleteChange: (id: string) => unwrap(changes[":id"].$delete({ param: { id } })),
  diffChange: (id: string) => unwrap(changes[":id"].diff.$get({ param: { id } })),
  listFeedback: (id: string) => unwrap(changes[":id"].feedback.$get({ param: { id } })),
  addFeedback: (id: string, input: FeedbackInput) => unwrap(changes[":id"].feedback.$post({ param: { id }, json: input })),
  updateFeedback: (id: string, noteId: string, input: Partial<FeedbackInput>) =>
    unwrap(changes[":id"].feedback[":noteId"].$patch({ param: { id, noteId }, json: input })),
  deleteFeedback: (id: string, noteId: string) => unwrap(changes[":id"].feedback[":noteId"].$delete({ param: { id, noteId } })),
};
