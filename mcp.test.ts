import { afterAll, describe, expect, test } from "bun:test";
import { openGraphStore } from "./db.ts";
import { createServer } from "./server.ts";

const store = openGraphStore(":memory:");
const server = createServer(store, 0);
let next = 1;

const rpc = async (method: string, params?: unknown, headers: Record<string, string> = {}) => {
  const res = await fetch(new URL("/mcp", server.url), {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ jsonrpc: "2.0", id: next++, method, params }),
  });
  return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : await res.text() };
};

const call = async (name: string, args: Record<string, unknown>) => {
  const { result } = (await rpc("tools/call", { name, arguments: args })).body;
  return { error: result.isError === true, text: result.content[0].text as string };
};

afterAll(() => {
  server.stop(true);
  store.close();
});

describe("MCP server", () => {
  test("introduces Diagram and lists its tools with input schemas from the API", async () => {
    const init = (await rpc("initialize", { protocolVersion: "2025-06-18" })).body.result;
    expect(init.serverInfo.name).toBe("Diagram");
    expect(init.instructions).toContain("http://127.0.0.1:4848");

    const tools = (await rpc("tools/list")).body.result.tools as { name: string; inputSchema: any }[];
    const addNode = tools.find(({ name }) => name === "add_node");
    expect(addNode?.inputSchema.required).toEqual(["graphId", "name"]);
    expect(addNode?.inputSchema.properties.type).toBeDefined();
    expect(JSON.stringify(tools)).not.toContain("$ref");
    expect(tools.map(({ name }) => name)).not.toContain("delete_graph");
  });

  test("builds a graph through the tools, and returns API errors as tool errors", async () => {
    const graph = JSON.parse((await call("create_graph", { name: "From Claude", description: "Made through MCP.", libraryIds: ["systems"] })).text);
    const a = JSON.parse((await call("add_node", { graphId: graph.id, name: "A", type: "service" })).text);
    const b = JSON.parse((await call("add_node", { graphId: graph.id, name: "B" })).text);
    await call("add_edge", { graphId: graph.id, source: a.id, target: b.id, type: "calls" });
    await call("update_node", { nodeId: b.id, description: "The second node." });
    const placed = JSON.parse((await call("auto_layout", { graphId: graph.id, direction: "vertical" })).text);
    expect(placed.graph.direction).toBe("vertical");
    expect(placed.nodes.every(({ position }: { position: unknown }) => position != null)).toBe(true);
    expect(placed.edges[0].route.length).toBeGreaterThanOrEqual(2);
    const view = JSON.parse((await call("get_graph", { graphId: graph.id })).text);
    expect(view.nodes.map(({ name, description }: { name: string; description: string }) => [name, description])).toEqual([
      ["A", ""],
      ["B", "The second node."],
    ]);
    expect(view.edges).toHaveLength(1);

    expect(await call("get_graph", { graphId: "nope" })).toEqual({ error: true, text: "The graph does not exist." });
    expect((await call("add_node", { name: "No graph" })).text).toBe("Give graphId.");
    expect((await call("remove_node_from_graph", { graphId: graph.id, nodeId: a.id })).text).toBe("Done.");
  });

  test("refuses requests from web pages and requests that are not JSON", async () => {
    expect((await rpc("tools/list", undefined, { origin: "https://example.com" })).status).toBe(403);
    expect((await rpc("tools/list", undefined, { origin: "http://localhost:4848" })).status).toBe(200);
    const res = await fetch(new URL("/mcp", server.url), { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    expect(res.status).toBe(415);
    const notification = await fetch(new URL("/mcp", server.url), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    });
    expect(notification.status).toBe(202);
  });
});
