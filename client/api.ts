import type {
  EdgeInput,
  Graph,
  GraphEdge,
  GraphNode,
  GraphSummary,
  GraphView,
  NodeInput,
  Position,
} from "../model.ts";

export class ApiError extends Error {
  constructor(readonly errors: string[]) {
    super(errors.join(" "));
  }
}

const request = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const res = await fetch(path, {
    method,
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json();
  if (!res.ok) throw new ApiError((data as { errors?: string[] }).errors ?? [`Request failed with ${res.status}.`]);
  return data as T;
};

export const api = {
  listGraphs: () => request<GraphSummary[]>("GET", "/api/graphs"),
  createGraph: (name: string) => request<Graph>("POST", "/api/graphs", { name }),
  renameGraph: (id: string, name: string) => request<Graph>("PATCH", `/api/graphs/${id}`, { name }),
  deleteGraph: (id: string) => request<void>("DELETE", `/api/graphs/${id}`),
  view: (id: string) => request<GraphView>("GET", `/api/graphs/${id}`),

  listNodes: () => request<GraphNode[]>("GET", "/api/nodes"),
  updateNode: (id: string, input: Partial<NodeInput>) => request<GraphNode>("PATCH", `/api/nodes/${id}`, input),
  deleteNode: (id: string) => request<void>("DELETE", `/api/nodes/${id}`),

  updateEdge: (id: string, input: Partial<EdgeInput>) => request<GraphEdge>("PATCH", `/api/edges/${id}`, input),
  deleteEdge: (id: string) => request<void>("DELETE", `/api/edges/${id}`),

  createNodeInGraph: (graphId: string, input: NodeInput, position: Position | null) =>
    request<GraphNode>("POST", `/api/graphs/${graphId}/nodes`, { ...input, position }),
  addNodeToGraph: (graphId: string, nodeId: string, position: Position | null) =>
    request<GraphView>("PUT", `/api/graphs/${graphId}/nodes/${nodeId}`, { position }),
  removeNodeFromGraph: (graphId: string, nodeId: string) =>
    request<void>("DELETE", `/api/graphs/${graphId}/nodes/${nodeId}`),
  moveNodes: (graphId: string, positions: Record<string, Position>) =>
    request<void>("PUT", `/api/graphs/${graphId}/positions`, positions),
  createEdgeInGraph: (graphId: string, input: EdgeInput) =>
    request<GraphEdge>("POST", `/api/graphs/${graphId}/edges`, input),
  removeEdgeFromGraph: (graphId: string, edgeId: string) =>
    request<void>("DELETE", `/api/graphs/${graphId}/edges/${edgeId}`),
};
