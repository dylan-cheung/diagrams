# graphs

A local macOS app to keep and edit graphs. It runs a Bun server (Hono) on `127.0.0.1`, opens a React Flow editor in your browser, and stores everything in SQLite.

## Model

The app uses the labeled property graph model of ISO GQL (ISO/IEC 39075). In graph theory terms it supports a mixed pseudograph: directed and undirected edges, parallel edges between the same two nodes, loops, and cycles.

| Entity | Fields | Rules |
|---|---|---|
| Node | `id`, `name`, `description`, `labels[]`, `properties{}` | The core entity. A node does not store its edges. The description is optional. |
| Edge | `id`, `source`, `target`, `directed`, `label`, `properties{}` | Its own entity. Deleting a node deletes its edges. |
| Graph | `id`, `name`, `description` + its nodes (with `x`, `y`) and edges | A named subgraph. Nodes and edges are shared, so one node can be in many graphs with a different position in each. A graph can include an edge only if it includes both nodes. The description says what the graph is for. It is required when you create a graph. |

Property values are strings, numbers, booleans or `null`.

Not supported: hyperedges (one edge with more than two nodes), nested nodes, and schemas that limit which labels can connect.

## Run

```bash
bun install
bun start
```

The app opens at http://127.0.0.1:4848.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `4848` | Server port |
| `GRAPH_DB` | `~/Library/Application Support/graphs/graphs.sqlite` | Database file |
| `OPEN_BROWSER` | on | Set `0` to not open the browser |

`bun run build` makes one binary, `dist/graphs`, that holds the server and the UI.

## Use

- Add a graph on the left with a name and a description of its purpose. Edit both in the inspector. Add nodes with **Add node**, or add existing nodes from the **Node library**.
- Drag from a dot on one node to a dot on another node to add an edge. Drag to the other dot on the same node to add a loop.
- Select a node or an edge to edit it in the inspector. **Remove from graph** keeps it in the library; **Delete everywhere** deletes it from every graph.
- Press Delete or Backspace to remove the selection from the graph.
- **Auto layout** places all nodes with dagre. New nodes without a position are placed below the others. Dragged positions are saved for each graph.

## API

The API docs are generated from the code. With the app running, open:

- http://127.0.0.1:4848/docs for the interactive reference (Scalar)
- http://127.0.0.1:4848/openapi.json for the OpenAPI 3.1 spec

Each route in `api.ts` is defined with the Zod schemas in `schemas.ts`. The same schemas validate requests, give the TypeScript types, generate the spec, and type the browser client (`hono/client`), so the docs cannot drift from the code. The docs page loads the Scalar viewer from a CDN, so it needs an internet connection.

## Check

```bash
bun test
bun run typecheck
```
