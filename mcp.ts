// A small MCP server (Streamable HTTP transport, JSON responses only) that gives Claude tools for Diagram. Each tool
// is one route of the Diagram API: the server calls the route in this process, so the API keeps its own validation and
// errors, and the input schema of each tool comes from the OpenAPI document of the route.

const PROTOCOL_VERSION = "2025-06-18";

export const INSTRUCTIONS = [
  "Diagram is the user's local app for graphs of systems and features, and for reviewing code changes. It runs at http://127.0.0.1:4848.",
  "- A graph holds nodes and edges. Each node and edge can have a type, a status, a description (what it is) and an intent (why it exists); get_vocabulary lists the types and statuses. A flow is one path through a graph, step by step. A group is a named box with a description that holds a set of the nodes of one graph, for example the parts that one file defines; each node has the groupId of its group. Publish saves a version that does not change.",
  "- A change shows one code change in four views: the idea (notes and points), the concepts (a graph), the pseudocode (blocks by layer) and the code (the diff of a git branch). Trace links connect each item to the items in the next view that carry it out. Feedback is a list of notes that the user writes while reviewing a change.",
  "- To change a graph that already has content, prefer create_proposal: the user reviews the proposal in Diagram before it changes the graph. Build a new graph directly with create_graph, add_node and add_edge.",
  "- Give the user links to what you made or changed: http://127.0.0.1:4848/graphs/<graph id> for a graph, and http://127.0.0.1:4848/changes/<change id>/idea for a change (or /concepts, /pseudocode, /code).",
].join("\n");

// The routes that are tools. Each `id` in a path gets the name of what it is (graphId, changeId, nodeId or edgeId).
// Routes that delete a graph or a change, or that apply a proposal, are not tools: the user does those in Diagram.
const ROUTES: { name: string; method: "get" | "post" | "patch" | "put" | "delete"; path: string }[] = [
  { name: "get_vocabulary", method: "get", path: "/api/vocabulary" },
  { name: "list_graphs", method: "get", path: "/api/graphs" },
  { name: "get_graph", method: "get", path: "/api/graphs/{id}" },
  { name: "create_graph", method: "post", path: "/api/graphs" },
  { name: "update_graph", method: "patch", path: "/api/graphs/{id}" },
  { name: "add_node", method: "post", path: "/api/graphs/{id}/nodes" },
  { name: "update_node", method: "patch", path: "/api/nodes/{id}" },
  { name: "remove_node_from_graph", method: "delete", path: "/api/graphs/{id}/nodes/{nodeId}" },
  { name: "set_node_group", method: "patch", path: "/api/graphs/{id}/nodes/{nodeId}" },
  { name: "create_group", method: "post", path: "/api/graphs/{id}/groups" },
  { name: "update_group", method: "patch", path: "/api/graphs/{id}/groups/{groupId}" },
  { name: "delete_group", method: "delete", path: "/api/graphs/{id}/groups/{groupId}" },
  { name: "add_edge", method: "post", path: "/api/graphs/{id}/edges" },
  { name: "update_edge", method: "patch", path: "/api/edges/{id}" },
  { name: "remove_edge_from_graph", method: "delete", path: "/api/graphs/{id}/edges/{edgeId}" },
  { name: "publish_graph", method: "post", path: "/api/graphs/{id}/versions" },
  { name: "list_versions", method: "get", path: "/api/graphs/{id}/versions" },
  { name: "get_version", method: "get", path: "/api/graphs/{id}/versions/{version}" },
  { name: "add_flow", method: "post", path: "/api/graphs/{id}/flows" },
  { name: "update_flow", method: "patch", path: "/api/graphs/{id}/flows/{flowId}" },
  { name: "list_runs", method: "get", path: "/api/graphs/{id}/runs" },
  { name: "list_proposals", method: "get", path: "/api/graphs/{id}/proposals" },
  { name: "get_proposal", method: "get", path: "/api/graphs/{id}/proposals/{proposalId}" },
  { name: "create_proposal", method: "post", path: "/api/graphs/{id}/proposals" },
  { name: "diff_proposal", method: "get", path: "/api/graphs/{id}/proposals/{proposalId}/diff" },
  { name: "list_changes", method: "get", path: "/api/changes" },
  { name: "get_change", method: "get", path: "/api/changes/{id}" },
  { name: "create_change", method: "post", path: "/api/changes" },
  { name: "update_change", method: "patch", path: "/api/changes/{id}" },
  { name: "get_change_diff", method: "get", path: "/api/changes/{id}/diff" },
  { name: "list_feedback", method: "get", path: "/api/changes/{id}/feedback" },
  { name: "add_feedback", method: "post", path: "/api/changes/{id}/feedback" },
  { name: "update_feedback", method: "patch", path: "/api/changes/{id}/feedback/{noteId}" },
];

const ID_NAMES: Record<string, string> = { graphs: "graphId", changes: "changeId", nodes: "nodeId", edges: "edgeId" };

type Schema = Record<string, any>;
type OpenApi = { paths?: Record<string, Record<string, any>>; components?: { schemas?: Record<string, Schema> } };
type Fetch = (request: Request) => Response | Promise<Response>;
type JsonRpcRequest = { jsonrpc: "2.0"; id?: string | number | null; method: string; params?: any };

// Puts the component schemas in place of each $ref, so each tool has a schema that stands alone.
const inline = (schema: unknown, components: Record<string, Schema>, seen: string[] = []): any => {
  if (Array.isArray(schema)) return schema.map((item) => inline(item, components, seen));
  if (schema == null || typeof schema !== "object") return schema;
  const ref = (schema as Schema).$ref;
  if (typeof ref === "string") {
    const name = ref.replace("#/components/schemas/", "");
    if (seen.includes(name)) throw new Error(`The schema ${name} refers to itself.`);
    return inline(components[name], components, [...seen, name]);
  }
  return Object.fromEntries(Object.entries(schema).map(([key, value]) => [key, inline(value, components, seen)]));
};

// An object schema made of parts (allOf), as an extended input is, becomes one object schema.
const merged = (schema: Schema): Schema => {
  if (!Array.isArray(schema.allOf)) return schema;
  const parts = (schema.allOf as Schema[]).map(merged);
  if (!parts.every((part) => part.type === "object")) return schema;
  const required = parts.flatMap((part) => (part.required as string[] | undefined) ?? []);
  return {
    type: "object",
    properties: Object.assign({}, ...parts.map((part) => part.properties ?? {})),
    ...(required.length > 0 && { required }),
  };
};

type Tool = {
  name: string;
  description: string;
  inputSchema: Schema;
  method: string;
  path: string;
  params: { name: string; arg: string; in: "path" | "query" }[];
  hasBody: boolean;
};

export const buildTools = (spec: OpenApi): Tool[] => {
  const components = spec.components?.schemas ?? {};
  return ROUTES.map(({ name, method, path }) => {
    const operation = spec.paths?.[path]?.[method];
    if (operation == null) throw new Error(`The API has no route ${method.toUpperCase()} ${path} for the tool ${name}.`);
    const idName = ID_NAMES[path.split("/")[2] ?? ""] ?? "id";
    const params = ((operation.parameters ?? []) as Schema[]).map((param) => ({
      name: param.name as string,
      arg: param.name === "id" ? idName : (param.name as string),
      in: param.in as "path" | "query",
      schema: { ...inline(param.schema, components), ...(param.description == null ? {} : { description: param.description }) },
    }));
    const body = operation.requestBody?.content?.["application/json"]?.schema;
    const bodySchema = body == null ? null : merged(inline(body, components));
    if (bodySchema != null && bodySchema.type !== "object") throw new Error(`The body of ${name} is not an object.`);
    const properties: Schema = { ...(bodySchema?.properties ?? {}) };
    for (const param of params) {
      if (param.arg in properties) throw new Error(`The tool ${name} has two inputs called ${param.arg}.`);
      properties[param.arg] = param.schema;
    }
    const required = [...params.filter((param) => param.in === "path").map((param) => param.arg), ...((bodySchema?.required as string[]) ?? [])];
    const description = [operation.summary, operation.description].filter((part) => part != null && part !== "").join(". ");
    return {
      name,
      description,
      inputSchema: { type: "object", properties, ...(required.length > 0 && { required }) },
      method: method.toUpperCase(),
      path,
      params: params.map(({ schema: _, ...param }) => param),
      hasBody: bodySchema != null,
    };
  });
};

const text = (value: string) => ({ content: [{ type: "text", text: value }] });
const failure = (message: string) => ({ ...text(message), isError: true });

// A request from a web page carries its Origin. Only Claude Code and other local clients may call the tools.
const allowedOrigin = (origin: string | null) => origin == null || /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);

export const createMcp = (spec: OpenApi, fetchApi: Fetch) => {
  const tools = buildTools(spec);

  const callTool = async (name: string, args: Record<string, unknown>) => {
    const tool = tools.find((item) => item.name === name);
    if (tool == null) return failure(`Unknown tool: ${name}`);
    const rest = { ...args };
    let path = tool.path;
    const query = new URLSearchParams();
    for (const param of tool.params) {
      const value = rest[param.arg];
      delete rest[param.arg];
      if (value == null) {
        if (param.in === "path") return failure(`Give ${param.arg}.`);
        continue;
      }
      if (param.in === "path") path = path.replace(`{${param.name}}`, encodeURIComponent(String(value)));
      else query.set(param.name, String(value));
    }
    const url = `http://diagram.local${path}${query.size > 0 ? `?${query}` : ""}`;
    const res = await fetchApi(
      new Request(url, { method: tool.method, headers: { "content-type": "application/json" }, body: tool.hasBody ? JSON.stringify(rest) : undefined }),
    );
    if (res.status === 204) return text("Done.");
    const body = await res.json().catch(() => null);
    if (!res.ok) return failure((body as { errors?: string[] } | null)?.errors?.join(" ") ?? `The request failed with ${res.status}.`);
    return text(JSON.stringify(body, null, 2));
  };

  const answer = async (request: JsonRpcRequest) => {
    const result = (value: unknown) => ({ jsonrpc: "2.0", id: request.id, result: value });
    switch (request.method) {
      case "initialize":
        return result({ protocolVersion: request.params?.protocolVersion ?? PROTOCOL_VERSION, capabilities: { tools: {} }, serverInfo: { name: "Diagram", version: "1.0.0" }, instructions: INSTRUCTIONS });
      case "ping":
        return result({});
      case "tools/list":
        return result({ tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })) });
      case "tools/call":
        try {
          return result(await callTool(String(request.params?.name ?? ""), request.params?.arguments ?? {}));
        } catch (error) {
          return result(failure(error instanceof Error ? error.message : String(error)));
        }
      default:
        return { jsonrpc: "2.0", id: request.id, error: { code: -32601, message: `Unknown method: ${request.method}` } };
    }
  };

  return async (req: Request) => {
    if (req.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
    if (!allowedOrigin(req.headers.get("origin"))) return new Response("Forbidden origin.", { status: 403 });
    if (!(req.headers.get("content-type") ?? "").includes("application/json")) return new Response("Send JSON.", { status: 415 });
    let body: JsonRpcRequest | JsonRpcRequest[];
    try {
      body = await req.json();
    } catch {
      return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "The body is not JSON." } }, { status: 400 });
    }
    const requests = Array.isArray(body) ? body : [body];
    const answers = await Promise.all(requests.filter((request) => request.id != null).map(answer));
    if (answers.length === 0) return new Response(null, { status: 202 });
    return Response.json(Array.isArray(body) ? answers : answers[0]);
  };
};
