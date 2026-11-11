import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { autoLayout } from "../layout.ts";
import type { GraphNode, GraphSummary, GraphVersionSummary, GraphView, Position, ProposalSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { GraphCanvas, type Selection } from "./canvas.tsx";
import { Inspector, type InspectorActions } from "./inspector.tsx";
import { ProposalReview } from "./review.tsx";

const withPositions = (view: GraphView, positions: Record<string, Position>): GraphView => ({
  ...view,
  nodes: view.nodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position })),
});

export const App = () => {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [library, setLibrary] = useState<GraphNode[]>([]);
  const [view, setView] = useState<GraphView | null>(null);
  const [versions, setVersions] = useState<GraphVersionSummary[]>([]);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [newGraphName, setNewGraphName] = useState("");
  const [newGraphDescription, setNewGraphDescription] = useState("");
  const [search, setSearch] = useState("");

  const loadView = useCallback(async (graphId: string) => {
    const next = await api.view(graphId);
    const unplaced = next.nodes.some(({ position }) => position == null);
    if (!unplaced) return next;
    const positions = autoLayout(next.nodes, next.edges, true);
    await api.moveNodes(graphId, positions);
    return withPositions(next, positions);
  }, []);

  const refresh = useCallback(
    async (graphId: string | null) => {
      const [nextGraphs, nextLibrary, nextView, nextVersions, nextProposals] = await Promise.all([
        api.listGraphs(),
        api.listNodes(),
        graphId == null ? Promise.resolve(null) : loadView(graphId),
        graphId == null ? Promise.resolve([]) : api.listVersions(graphId),
        graphId == null ? Promise.resolve([]) : api.listProposals(graphId),
      ]);
      setGraphs(nextGraphs);
      setLibrary(nextLibrary);
      setView(nextView);
      setVersions(nextVersions);
      setProposals(nextProposals);
      setSelection((current) => {
        if (current == null || nextView == null) return null;
        const items = current.kind === "node" ? nextView.nodes : nextView.edges;
        return items.some(({ id }) => id === current.id) ? current : null;
      });
    },
    [loadView],
  );

  const run = useCallback(
    async <T,>(action: () => Promise<T>, graphId: string | null = view?.graph.id ?? null) => {
      try {
        const result = await action();
        setErrors([]);
        setNotice(null);
        await refresh(graphId);
        return result;
      } catch (error) {
        if (error instanceof ApiError) setErrors(error.errors);
        else throw error;
        return undefined;
      }
    },
    [refresh, view],
  );

  useEffect(() => {
    void refresh(null);
  }, [refresh]);

  const graphId = view?.graph.id ?? null;
  const inGraph = useMemo(() => new Set(view?.nodes.map(({ id }) => id) ?? []), [view]);
  const filteredLibrary = library.filter((node) =>
    `${node.name} ${node.labels.join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()),
  );

  const openGraph = (id: string) => {
    setSelection(null);
    setReviewing(null);
    setErrors([]);
    void run(async () => undefined, id);
  };

  const createGraph = async (event: FormEvent) => {
    event.preventDefault();
    const graph = await run(() => api.createGraph({ name: newGraphName, description: newGraphDescription }), graphId);
    if (graph != null) {
      setNewGraphName("");
      setNewGraphDescription("");
      openGraph(graph.id);
    }
  };

  const actions: InspectorActions | null =
    graphId == null
      ? null
      : {
          updateGraph: (patch) => void run(() => api.updateGraph(graphId, patch)),
          deleteGraph: () => void run(() => api.deleteGraph(graphId), null),
          publish: async () => {
            const latest = versions[0]?.version;
            const published = await run(() => api.publish(graphId));
            if (published != null) {
              setNotice(published.version === latest ? `No changes since version ${published.version}.` : `Published version ${published.version}.`);
            }
          },
          updateNode: (id, patch) => void run(() => api.updateNode(id, patch)),
          removeNodeFromGraph: (id) => void run(() => api.removeNodeFromGraph(graphId, id)),
          deleteNode: (id) => void run(() => api.deleteNode(id)),
          updateEdge: (id, patch) => void run(() => api.updateEdge(id, patch)),
          removeEdgeFromGraph: (id) => void run(() => api.removeEdgeFromGraph(graphId, id)),
          deleteEdge: (id) => void run(() => api.deleteEdge(id)),
          reviewProposal: (id) => {
            setErrors([]);
            setReviewing(id);
          },
        };

  const addNode = async () => {
    if (graphId == null) return;
    const node = await run(() => api.createNodeInGraph(graphId, { name: "New node" }, null));
    if (node != null) setSelection({ kind: "node", id: node.id });
  };

  const relayout = () => {
    if (view == null) return;
    void run(() => api.moveNodes(view.graph.id, autoLayout(view.nodes, view.edges, false)));
  };

  const move = (positions: Record<string, Position>) => {
    if (view == null) return;
    setView(withPositions(view, positions));
    api.moveNodes(view.graph.id, positions).catch((error: unknown) => {
      if (error instanceof ApiError) setErrors(error.errors);
    });
  };

  const connect = async (source: string, target: string) => {
    if (graphId == null) return;
    const edge = await run(() => api.createEdgeInGraph(graphId, { source, target }));
    if (edge != null) setSelection({ kind: "edge", id: edge.id });
  };

  const remove = (nodeIds: string[], edgeIds: string[]) => {
    if (graphId == null) return;
    void run(async () => {
      for (const edgeId of edgeIds) await api.removeEdgeFromGraph(graphId, edgeId);
      for (const nodeId of nodeIds) await api.removeNodeFromGraph(graphId, nodeId);
    });
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <section className="sidebar-section">
          <h1>Diagram</h1>
          <form className="graph-form" onSubmit={createGraph}>
            <input placeholder="New graph name" value={newGraphName} onChange={(e) => setNewGraphName(e.target.value)} required />
            <textarea
              placeholder="What is this graph for?"
              rows={2}
              value={newGraphDescription}
              onChange={(e) => setNewGraphDescription(e.target.value)}
              required
            />
            <button type="submit">Add</button>
          </form>
          <ul className="list">
            {graphs.map((graph) => (
              <li key={graph.id}>
                <button type="button" className={graph.id === graphId ? "active" : undefined} onClick={() => openGraph(graph.id)}>
                  <span>{graph.name}</span>
                  {graph.description !== "" && <span className="description">{graph.description}</span>}
                  <span className="meta">
                    {graph.nodeCount} nodes · {graph.edgeCount} edges
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
        <section className="sidebar-section">
          <h1>Node library</h1>
          <input placeholder="Search nodes and labels" value={search} onChange={(e) => setSearch(e.target.value)} />
          <ul className="list">
            {filteredLibrary.map((node) => (
              <li key={node.id} className="library-item">
                <span>
                  {node.name}
                  {node.labels.length > 0 && <span className="meta"> · {node.labels.join(", ")}</span>}
                </span>
                {graphId != null &&
                  (inGraph.has(node.id) ? (
                    <span className="meta">in graph</span>
                  ) : (
                    <button type="button" onClick={() => void run(() => api.addNodeToGraph(graphId, node.id, null))}>
                      Add
                    </button>
                  ))}
              </li>
            ))}
          </ul>
        </section>
      </aside>
      {view != null && reviewing != null ? (
        <ProposalReview
          key={reviewing}
          graphId={view.graph.id}
          proposalId={reviewing}
          versions={versions}
          draft={view}
          onClose={() => {
            setReviewing(null);
            void refresh(view.graph.id);
          }}
          onApplied={(message) => {
            setReviewing(null);
            void refresh(view.graph.id).then(() => setNotice(message));
          }}
        />
      ) : (
        <>
        <main className="canvas-pane">
          <div className="toolbar">
            <div className="graph-title">{view?.graph.name ?? "No graph selected"}</div>
            <div className="toolbar-actions">
              <button type="button" onClick={() => void addNode()} disabled={view == null}>
                Add node
              </button>
              <button type="button" onClick={relayout} disabled={view == null || view.nodes.length === 0}>
                Auto layout
              </button>
            </div>
          </div>
          {errors.length > 0 && (
            <ul className="errors">
              {errors.map((error) => (
                <li key={error}>{error}</li>
              ))}
            </ul>
          )}
          <div className="canvas">
            {view == null ? (
              <p className="empty">Pick a graph on the left, or add a new one.</p>
            ) : (
              <ReactFlowProvider key={view.graph.id}>
                <GraphCanvas
                  view={view}
                  selection={selection}
                  onSelect={setSelection}
                  onMove={move}
                  onConnect={(source, target) => void connect(source, target)}
                  onRemove={remove}
                />
              </ReactFlowProvider>
            )}
          </div>
        </main>
        <aside className="inspector">
          {view == null || actions == null ? (
            <p className="hint">No graph selected.</p>
          ) : (
            <Inspector view={view} versions={versions} proposals={proposals} notice={notice} selection={selection} actions={actions} />
          )}
        </aside>
        </>
      )}
    </div>
  );
};
