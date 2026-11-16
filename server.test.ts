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
    const dup = (await send("POST", "/api/graphs", { name: "dup", description: "First." })).body;
    expect((await send("POST", `/api/graphs/${dup.id}/nodes`, { name: " " })).body).toEqual({ errors: ["A node needs a name."] });
    expect((await send("POST", `/api/graphs/${dup.id}/nodes`, { name: "X", properties: { nested: { a: 1 } } })).body).toEqual({
      errors: ["properties.nested: Property values must be a string, number, boolean or null."],
    });
    expect((await fetch(new URL("/api/nodes", server.url), { method: "POST", body: JSON.stringify({ name: "Floating" }) })).ok).toBe(false);
    expect((await send("GET", "/api/nodes/missing")).body).toEqual({ errors: ["The node does not exist."] });
    expect((await send("GET", "/api/nodes/missing")).status).toBe(404);
    expect((await send("POST", "/api/graphs", { name: "dup", description: "Second." })).status).toBe(409);
    expect((await send("POST", "/api/graphs", { name: "no purpose" })).status).toBe(400);
    expect((await send("POST", "/api/graphs", { name: "blank purpose", description: " " })).body).toEqual({
      errors: ["A graph needs a description of its purpose."],
    });
    expect((await send("PUT", "/api/graphs/missing/positions", { a: { x: "1" } })).status).toBe(400);
  });
});

describe("versions API", () => {
  test("publishes a graph and reads a version by number or latest", async () => {
    const graph = (await send("POST", "/api/graphs", { name: "tree", description: "A decision tree." })).body;
    await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Start" });
    const published = await send("POST", `/api/graphs/${graph.id}/versions`);
    expect(published.body).toMatchObject({ version: 1, view: { nodes: [{ name: "Start" }] } });
    expect((await send("GET", `/api/graphs/${graph.id}/versions/latest`)).body).toEqual(published.body);
    expect((await send("GET", `/api/graphs/${graph.id}/versions/1`)).body).toEqual(published.body);
    expect((await send("GET", `/api/graphs/${graph.id}/versions`)).body).toEqual([
      { graphId: graph.id, version: 1, hash: published.body.hash, publishedAt: published.body.publishedAt },
    ]);
    expect((await send("GET", `/api/graphs/${graph.id}/versions/9`)).status).toBe(404);
    expect((await send("GET", `/api/graphs/${graph.id}/versions/abc`)).status).toBe(400);
    expect((await send("POST", "/api/graphs/missing/versions")).status).toBe(404);
  });
});

describe("proposals API", () => {
  test("proposes, compares and applies a change", async () => {
    const graph = (await send("POST", "/api/graphs", { name: "flow", description: "A call flow." })).body;
    const start = (await send("POST", `/api/graphs/${graph.id}/nodes`, { name: "Start" })).body;
    await send("POST", `/api/graphs/${graph.id}/versions`);
    const created = await send("POST", `/api/graphs/${graph.id}/proposals`, {
      title: "Add an end",
      nodes: [{ id: start.id }, { id: "end", name: "End" }],
      edges: [{ id: "e1", source: start.id, target: "end" }],
    });
    expect(created.body).toMatchObject({ status: "open", baseVersion: 1 });
    const path = `/api/graphs/${graph.id}/proposals/${created.body.id}`;

    const diff = (await send("GET", `${path}/diff`)).body;
    expect(diff.against).toBe(1);
    expect(diff.diff.nodes.map(({ status }: { status: string }) => status)).toEqual(["unchanged", "added"]);
    expect((await send("GET", `${path}/diff?against=draft`)).body.against).toBe("draft");
    expect((await send("GET", `${path}/diff?against=nope`)).status).toBe(400);

    const applied = await send("POST", `${path}/apply`, { publish: true });
    expect(applied.body).toMatchObject({ proposal: { status: "applied" }, version: { version: 2 } });
    expect((await send("POST", `${path}/discard`)).status).toBe(409);
    expect((await send("GET", `/api/graphs/${graph.id}/proposals`)).body).toHaveLength(1);
    expect((await send("GET", `/api/graphs/${graph.id}/proposals/missing`)).status).toBe(404);
  });
});

describe("API docs", () => {
  test("the OpenAPI spec lists every route", async () => {
    const spec = (await send("GET", "/openapi.json")).body;
    expect(spec.openapi).toBe("3.1.0");
    expect(spec.info.title).toBe("Diagram API");
    expect(Object.keys(spec.paths).sort()).toEqual([
      "/api/edges",
      "/api/edges/{id}",
      "/api/graphs",
      "/api/graphs/{id}",
      "/api/graphs/{id}/draft",
      "/api/graphs/{id}/edges",
      "/api/graphs/{id}/edges/{edgeId}",
      "/api/graphs/{id}/layout",
      "/api/graphs/{id}/nodes",
      "/api/graphs/{id}/nodes/{nodeId}",
      "/api/graphs/{id}/positions",
      "/api/graphs/{id}/proposals",
      "/api/graphs/{id}/proposals/{proposalId}",
      "/api/graphs/{id}/proposals/{proposalId}/apply",
      "/api/graphs/{id}/proposals/{proposalId}/diff",
      "/api/graphs/{id}/proposals/{proposalId}/discard",
      "/api/graphs/{id}/versions",
      "/api/graphs/{id}/versions/{version}",
      "/api/nodes",
      "/api/nodes/{id}",
      "/api/vocabulary",
    ]);
    expect(Object.keys(spec.components.schemas)).toEqual(expect.arrayContaining(["Node", "Edge", "Graph", "GraphView", "Error"]));
  });

  test("serves the docs page", async () => {
    const res = await fetch(new URL("/docs", server.url));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("/openapi.json");
  });
});
