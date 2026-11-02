import { hc, type ClientResponse } from "hono/client";
import type { AppType } from "../api.ts";
import type { EdgeInput, GraphInput, NodeInput, Position } from "../model.ts";

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

export const api = {
  listGraphs: () => unwrap(graphs.$get()),
  createGraph: (input: GraphInput) => unwrap(graphs.$post({ json: input })),
  updateGraph: (id: string, input: Partial<GraphInput>) => unwrap(graphs[":id"].$patch({ param: { id }, json: input })),
  deleteGraph: (id: string) => unwrap(graphs[":id"].$delete({ param: { id } })),
  view: (id: string) => unwrap(graphs[":id"].$get({ param: { id } })),
  publish: (id: string) => unwrap(graphs[":id"].versions.$post({ param: { id } })),
  listVersions: (id: string) => unwrap(graphs[":id"].versions.$get({ param: { id } })),
  getVersion: (id: string, version: number | "latest") =>
    unwrap(graphs[":id"].versions[":version"].$get({ param: { id, version: String(version) } })),

  listProposals: (id: string) => unwrap(graphs[":id"].proposals.$get({ param: { id } })),
  getProposal: (id: string, proposalId: string) => unwrap(graphs[":id"].proposals[":proposalId"].$get({ param: { id, proposalId } })),
  diffProposal: (id: string, proposalId: string, against: number | "latest" | "draft") =>
    unwrap(graphs[":id"].proposals[":proposalId"].diff.$get({ param: { id, proposalId }, query: { against: String(against) } })),
  applyProposal: (id: string, proposalId: string, publish: boolean) =>
    unwrap(graphs[":id"].proposals[":proposalId"].apply.$post({ param: { id, proposalId }, json: { publish } })),
  discardProposal: (id: string, proposalId: string) =>
    unwrap(graphs[":id"].proposals[":proposalId"].discard.$post({ param: { id, proposalId } })),

  listNodes: () => unwrap(nodes.$get()),
  updateNode: (id: string, input: Partial<NodeInput>) => unwrap(nodes[":id"].$patch({ param: { id }, json: input })),
  deleteNode: (id: string) => unwrap(nodes[":id"].$delete({ param: { id } })),

  updateEdge: (id: string, input: Partial<EdgeInput>) => unwrap(edges[":id"].$patch({ param: { id }, json: input })),
  deleteEdge: (id: string) => unwrap(edges[":id"].$delete({ param: { id } })),

  createNodeInGraph: (id: string, input: NodeInput, position: Position | null) =>
    unwrap(graphs[":id"].nodes.$post({ param: { id }, json: { ...input, position } })),
  addNodeToGraph: (id: string, nodeId: string, position: Position | null) =>
    unwrap(graphs[":id"].nodes[":nodeId"].$put({ param: { id, nodeId }, json: { position } })),
  removeNodeFromGraph: (id: string, nodeId: string) =>
    unwrap(graphs[":id"].nodes[":nodeId"].$delete({ param: { id, nodeId } })),
  moveNodes: (id: string, positions: Record<string, Position>) =>
    unwrap(graphs[":id"].positions.$put({ param: { id }, json: positions })),
  createEdgeInGraph: (id: string, input: EdgeInput) => unwrap(graphs[":id"].edges.$post({ param: { id }, json: input })),
  removeEdgeFromGraph: (id: string, edgeId: string) =>
    unwrap(graphs[":id"].edges[":edgeId"].$delete({ param: { id, edgeId } })),
};
