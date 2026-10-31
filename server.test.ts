import { afterAll, describe, expect, test } from "bun:test";
import { openGraphStore } from "./db.ts";
import { createServer } from "./server.ts";

const store = openGraphStore(":memory:");
const server = createServer(store, 0);

const send = async (method: string, path: string, body?: unknown) => {
  const res = await fetch(new URL(path, server.url), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
};

afterAll(() => {
  server.stop(true);
  store.close();
});

describe("API", () => {
  test("builds a graph of nodes and edges", async () => {
    const graph = (await send("POST", "/api/graphs", { name: "people", description: "Who knows whom." })).body;
    const ada = (await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Ada", labels: ["Person"], position: { x: 0, y: 0 } })).body;
    const bob = (await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Bob", properties: { age: 41 } })).body;
    const knows = await send("POST", `/api/graphs/${graph.id}/edges`, { source: ada.id, target: bob.id, label: "knows", directed: false });
    expect(knows.status).toBe(200);

    expect((await send("PUT", `/api/graphs/${graph.id}/positions`, { [bob.id]: { x: 200, y: 40 } })).status).toBe(204);
    const view = (await send("GET", `/api/graphs/${graph.id}`)).body;
    expect(view.nodes.map(({ name, position }: { name: string; position: unknown }) => [name, position])).toEqual([
      ["Ada", { x: 0, y: 0 }],
      ["Bob", { x: 200, y: 40 }],
    ]);
    expect(view.edges[0]).toMatchObject({ label: "knows", directed: false });

    const renamed = await send("PATCH", `/api/nodes/${bob.id}`, { name: "Robert" });
    expect(renamed.body).toMatchObject({ name: "Robert", properties: { age: 41 } });

    expect((await send("GET", "/api/graphs")).body).toEqual([expect.objectContaining({ nodeCount: 2, edgeCount: 1 })]);
  });

  test("returns 400, 404 and 409 with messages", async () => {
    expect((await send("POST", "/api/nodes", { name: " " })).body).toEqual({ errors: ["A node needs a name."] });
    expect((await send("POST", "/api/nodes", { name: "X", properties: { nested: { a: 1 } } })).body).toEqual({
      errors: ["properties.nested: Property values must be a string, number, boolean or null."],
    });
    expect((await send("GET", "/api/nodes/missing")).body).toEqual({ errors: ["The node does not exist."] });
    expect((await send("GET", "/api/nodes/missing")).status).toBe(404);
    await send("POST", "/api/graphs", { name: "dup", description: "First." });
    expect((await send("POST", "/api/graphs", { name: "dup", description: "Second." })).status).toBe(409);
    expect((await send("POST", "/api/graphs", { name: "no purpose" })).status).toBe(400);
    expect((await send("POST", "/api/graphs", { name: "blank purpose", description: " " })).body).toEqual({
      errors: ["A graph needs a description of its purpose."],
    });
    expect((await send("PUT", "/api/graphs/missing/positions", { a: { x: "1" } })).status).toBe(400);
  });
});

describe("API docs", () => {
  test("the OpenAPI spec lists every route", async () => {
    const spec = (await send("GET", "/openapi.json")).body;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("graphs API");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/edges",
      "/api/edges/{id}",
      "/api/graphs",
      "/api/graphs/{id}",
      "/api/graphs/{id}/edges",
      "/api/graphs/{id}/edges/{edgeId}",
      "/api/graphs/{id}/nodes",
      "/api/graphs/{id}/nodes/{nodeId}",
      "/api/graphs/{id}/positions",
      "/api/nodes",
      "/api/nodes/{id}",
    ]);
    expect(Object.keys(spec.components.schemas)).toEqual(expect.arrayContaining(["Node", "Edge", "Graph", "GraphView", "Error"]));
  });

  test("serves the docs page", async () => {
    const res = await fetch(new URL("/docs", server.url));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("/openapi.json");
  });
});
