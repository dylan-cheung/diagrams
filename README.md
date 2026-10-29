# Graph app

A local macOS app to keep and edit graphs. It runs a Bun server on `127.0.0.1`, opens a React Flow editor in your browser, and stores everything in SQLite.

## Model

The app uses the labeled property graph model of ISO GQL (ISO/IEC 39075). In graph theory terms it supports a mixed pseudograph: directed and undirected edges, parallel edges between the same two nodes, loops, and cycles.

| Entity | Fields | Rules |
|---|---|---|
| Node | `id`, `name`, `labels[]`, `properties{}` | The core entity. A node does not store its edges. |
| Edge | `id`, `source`, `target`, `directed`, `label`, `properties{}` | Its own entity. Deleting a node deletes its edges. |
| Graph | `id`, `name` + its nodes (with `x`, `y`) and edges | A named subgraph. Nodes and edges are shared, so one node can be in many graphs with a different position in each. A graph can include an edge only if it includes both nodes. |

Property values are strings, numbers, booleans or `null`.

Not supported: hyperedges (one edge with more than two nodes), nested nodes, and schemas that limit which labels can connect.

## Run

```bash
bun install
bun start
```

The app opens at http://127.0.0.1:4848. The database is at `~/Library/Application Support/graph-app/graph.sqlite`.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `4848` | Server port |
| `GRAPH_DB` | `~/Library/Application Support/graph-app/graph.sqlite` | Database file |
| `OPEN_BROWSER` | on | Set `0` to not open the browser |

`bun run build` makes one binary, `dist/graph-app`, that holds the server and the UI.

## Use

- Add a graph on the left. Add nodes with **Add node**, or add existing nodes from the **Node library**.
- Drag from a dot on one node to a dot on another node to add an edge. Drag to the other dot on the same node to add a loop.
- Select a node or an edge to edit it in the inspector. **Remove from graph** keeps it in the library; **Delete everywhere** deletes it from every graph.
- Press Delete or Backspace to remove the selection from the graph.
- **Auto layout** places all nodes with dagre. New nodes without a position are placed below the others. Dragged positions are saved for each graph.

## API

| Method | Path | Body |
|---|---|---|
| `GET`, `POST` | `/api/nodes` | `{ name, labels?, properties? }` |
| `GET`, `PATCH`, `DELETE` | `/api/nodes/:id` | |
| `GET`, `POST` | `/api/edges` | `{ source, target, directed?, label?, properties? }` |
| `GET`, `PATCH`, `DELETE` | `/api/edges/:id` | |
| `GET`, `POST` | `/api/graphs` | `{ name }` |
| `GET`, `PATCH`, `DELETE` | `/api/graphs/:id` | `GET` returns `{ graph, nodes, edges }` |
| `POST` | `/api/graphs/:id/nodes` | Create a node in the graph: `{ name, labels?, properties?, position? }` |
| `PUT`, `DELETE` | `/api/graphs/:id/nodes/:nodeId` | Add an existing node (and its edges to nodes already in the graph), or remove it |
| `PUT` | `/api/graphs/:id/positions` | `{ [nodeId]: { x, y } }` |
| `POST` | `/api/graphs/:id/edges` | Create an edge in the graph |
| `PUT`, `DELETE` | `/api/graphs/:id/edges/:edgeId` | Add an existing edge, or remove it |

## Check

```bash
bun test
bun run typecheck
```
