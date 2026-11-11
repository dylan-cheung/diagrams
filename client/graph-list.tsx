import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { GraphSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { go, Link } from "./router.tsx";

type SortKey = "name" | "published" | "nodeCount" | "openProposals" | "updatedAt";

const COLUMNS: { key: SortKey; name: string; numeric?: boolean }[] = [
  { key: "name", name: "Name" },
  { key: "published", name: "Version", numeric: true },
  { key: "nodeCount", name: "Nodes", numeric: true },
  { key: "openProposals", name: "Proposals", numeric: true },
  { key: "updatedAt", name: "Changed" },
];

const compare = (a: GraphSummary, b: GraphSummary, key: SortKey) => {
  const left = a[key];
  const right = b[key];
  if (left == null || right == null) return left == null ? (right == null ? 0 : 1) : -1;
  return typeof left === "number" && typeof right === "number" ? left - right : String(left).localeCompare(String(right));
};

export const localTime = (iso: string) => new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });

const NewGraphDialog = ({ onClose }: { onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => dialog.current?.showModal(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const graph = await api.createGraph({ name, description });
      go({ page: "graph", graphId: graph.id, mode: "edit" });
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      else throw error;
    }
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <form className="section" onSubmit={(event) => void submit(event)}>
        <h2>New graph</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>
        <label className="field">
          <span>Purpose</span>
          <textarea rows={3} placeholder="What is this graph for?" value={description} onChange={(e) => setDescription(e.target.value)} required />
        </label>
        {errors.map((error) => (
          <p key={error} className="warning">
            {error}
          </p>
        ))}
        <div className="row">
          <button type="submit" className="primary">
            Create
          </button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
};

export const GraphList = () => {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; descending: boolean }>({ key: "name", descending: false });

  const refresh = useCallback(async () => {
    try {
      setGraphs(await api.listGraphs());
      setErrors([]);
    } catch (error) {
      setErrors(error instanceof ApiError ? error.errors : [(error as Error).message]);
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [refresh]);

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word !== "");
    const matched = graphs.filter((graph) => {
      const text = `${graph.name} ${graph.id} ${graph.description}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
    const sign = sort.descending ? -1 : 1;
    return matched.sort((a, b) => sign * compare(a, b, sort.key) || a.name.localeCompare(b.name));
  }, [graphs, query, sort]);

  const sortBy = (key: SortKey, numeric?: boolean) =>
    setSort((current) => (current.key === key ? { key, descending: !current.descending } : { key, descending: numeric === true || key === "updatedAt" }));

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Graphs</h1>
        <input className="search" type="search" placeholder="Search by name, ID or purpose" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
        <span className="spacer" />
        <button type="button" className="primary" onClick={() => setCreating(true)}>
          New graph
        </button>
        <a href="/docs" target="_blank" rel="noreferrer">
          API
        </a>
      </header>
      {errors.length > 0 && (
        <div className="banner errors">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}
      <div className="table-wrap">
        <table className="graph-table">
          <thead>
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  className={column.numeric ? "numeric" : ""}
                  aria-sort={sort.key === column.key ? (sort.descending ? "descending" : "ascending") : "none"}
                >
                  <button type="button" onClick={() => sortBy(column.key, column.numeric)}>
                    {column.name}
                    <span className="sort-mark">{sort.key === column.key ? (sort.descending ? "▼" : "▲") : ""}</span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} onClick={() => go({ page: "graph", graphId: row.id, mode: "view" })}>
                <td>
                  <Link className="row-name" to={{ page: "graph", graphId: row.id, mode: "view" }} onClick={(e) => e.stopPropagation()}>
                    {row.name}
                  </Link>
                  {row.description !== "" && <div className="row-purpose">{row.description}</div>}
                </td>
                <td className="numeric">
                  {row.published == null ? <span className="meta">none</span> : `v${row.published}`}
                  {row.changed && (
                    <span className="pill draft" title="The draft has changes that are not published.">
                      draft
                    </span>
                  )}
                </td>
                <td className="numeric">
                  {row.nodeCount}
                  <span className="meta"> / {row.edgeCount} edges</span>
                </td>
                <td className="numeric">{row.openProposals === 0 ? <span className="meta">0</span> : <span className="pill open">{row.openProposals} open</span>}</td>
                <td className="meta">{localTime(row.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {loaded && rows.length === 0 && <p className="empty">{graphs.length === 0 ? "No graphs yet. Click New graph to make one." : "No graph matches the search."}</p>}
      </div>
      {creating && <NewGraphDialog onClose={() => setCreating(false)} />}
    </div>
  );
};
