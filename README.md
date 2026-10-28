# Graph app

A local macOS app to keep and edit directed graphs. It runs a Bun server on `127.0.0.1` and opens the editor in your browser. All data is in one SQLite table, `graphs`.


## Run

```bash
bun install
bun start
```

The app opens at http://127.0.0.1:4848. The database is at `~/Library/Application Support/graph-app/graphs.sqlite`.

| Variable | Default | Use |
|---|---|---|
| `PORT` | `4848` | Server port |
| `GRAPH_DB` | `~/Library/Application Support/graph-app/graphs.sqlite` | Database file |
| `OPEN_BROWSER` | on | Set `0` to not open the browser |

## Build one binary

```bash
bun run build
./dist/graph-app
```

The binary holds the server and the UI, and needs no Bun install.

## Data model

```ts
type Graph = {
  _id: string;
  name: string;
  type: string;
  nodes: {
    id: string;
    type: string;
    label: string;
    next: string | null;
    routes: { key: string; label: string; description?: string; target: string | null; stop: boolean }[];
  }[];
  createdAt: string;
  updatedAt: string;
};
```

The server rejects a graph with duplicate node ids, a `next` or route `target` that points to a missing node, a route key that is not `[a-z0-9_]+`, a route that both stops and has a target, or a cycle. Graph names are unique.

## API

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/graphs` | |
| `POST` | `/api/graphs` | `{ name, type?, nodes? }` |
| `GET` | `/api/graphs/:id` | |
| `PUT` | `/api/graphs/:id` | `{ name, type, nodes }` |
| `DELETE` | `/api/graphs/:id` | |

## Check

```bash
bun test
bun run typecheck
```
