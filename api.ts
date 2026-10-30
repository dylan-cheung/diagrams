import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { Scalar } from "@scalar/hono-api-reference";
import { StoreError, type GraphStore } from "./db.ts";
import {
  Edge,
  EdgeInput,
  EdgePatch,
  ErrorBody,
  Graph,
  GraphNameInput,
  GraphSummary,
  GraphView,
  Node,
  NodeInGraphInput,
  NodeInput,
  NodePatch,
  PlaceNodeInput,
  Positions,
} from "./schemas.ts";

const pathParam = (name: string) => z.string().openapi({ param: { name, in: "path" } });

const IdParams = z.object({ id: pathParam("id") });
const GraphNodeParams = z.object({ id: pathParam("id"), nodeId: pathParam("nodeId") });
const GraphEdgeParams = z.object({ id: pathParam("id"), edgeId: pathParam("edgeId") });

const json = <T extends z.ZodType>(schema: T, description: string) => ({
  content: { "application/json": { schema } },
  description,
});

const body = <T extends z.ZodType>(schema: T) => ({ body: { content: { "application/json": { schema } }, required: true } });

const errors = {
  400: json(ErrorBody, "The request is not valid."),
  404: json(ErrorBody, "A graph, node or edge in the path does not exist."),
  409: json(ErrorBody, "The graph name is already used."),
};

const noContent = { 204: { description: "Done." } };

const route = <const T extends Parameters<typeof createRoute>[0]>(config: T) =>
  createRoute({ ...config, responses: { ...errors, ...config.responses } });

const tag = { nodes: ["Nodes"], edges: ["Edges"], graphs: ["Graphs"], membership: ["Graph membership"] };

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
      route({ method: "get", path: "/api/nodes", tags: tag.nodes, summary: "List all nodes", responses: { 200: json(z.array(Node), "Every node, by name.") } }),
      (c) => c.json(store.listNodes(), 200),
    )
    .openapi(
      route({ method: "post", path: "/api/nodes", tags: tag.nodes, summary: "Create a node", request: body(NodeInput), responses: { 200: json(Node, "The new node.") } }),
      (c) => c.json(store.createNode(c.req.valid("json")), 200),
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
      route({
        method: "post",
        path: "/api/edges",
        tags: tag.edges,
        summary: "Create an edge",
        description: "Loops (source = target) and parallel edges are allowed. directed defaults to true.",
        request: body(EdgeInput),
        responses: { 200: json(Edge, "The new edge.") },
      }),
      (c) => c.json(store.createEdge(c.req.valid("json")), 200),
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
        description: "When a new endpoint is not in a graph, the edge leaves that graph.",
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
      route({ method: "post", path: "/api/graphs", tags: tag.graphs, summary: "Create a graph", request: body(GraphNameInput), responses: { 200: json(Graph, "The new, empty graph.") } }),
      (c) => c.json(store.createGraph(c.req.valid("json").name), 200),
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
        summary: "Rename a graph",
        request: { params: IdParams, ...body(GraphNameInput) },
        responses: { 200: json(Graph, "The renamed graph.") },
      }),
      (c) => c.json(store.renameGraph(c.req.valid("param").id, c.req.valid("json").name), 200),
    )
    .openapi(
      route({
        method: "delete",
        path: "/api/graphs/{id}",
        tags: tag.graphs,
        summary: "Delete a graph",
        description: "Its nodes and edges stay in the library.",
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
        request: { params: IdParams, ...body(NodeInGraphInput) },
        responses: { 200: json(Node, "The new node.") },
      }),
      (c) => {
        const { position, ...input } = c.req.valid("json");
        return c.json(store.createNodeInGraph(c.req.valid("param").id, input, position ?? null), 200);
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
        description: "Also removes its edges from this graph. The node stays in the library.",
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
        method: "post",
        path: "/api/graphs/{id}/edges",
        tags: tag.membership,
        summary: "Create an edge in a graph",
        description: "Both nodes must already be in the graph.",
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
        description: "The edge stays in the library.",
        request: { params: GraphEdgeParams },
        responses: noContent,
      }),
      (c) => {
        const { id, edgeId } = c.req.valid("param");
        store.removeEdgeFromGraph(id, edgeId);
        return c.body(null, 204);
      },
    );

  app.doc31("/openapi.json", {
    openapi: "3.1.0",
    info: {
      title: "graphs API",
      version: "3.0.0",
      description:
        "A labeled property graph. Nodes and edges are shared entities; a graph is a named subgraph that holds nodes, their positions, and edges.",
    },
  });
  app.get("/docs", Scalar({ url: "/openapi.json", pageTitle: "graphs API", showDeveloperTools: "never" }));

  return routes;
};

export type AppType = ReturnType<typeof createApi>;
