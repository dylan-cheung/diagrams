import { Panel, ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toContent } from "../diff.ts";
import { autoLayout } from "../layout.ts";
import type { GraphContent, GraphSummary, GraphVersion, GraphVersionSummary, GraphView, Position, ProposalSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { GraphCanvas, type Selection } from "./canvas.tsx";
import { Inspector, type InspectorActions } from "./inspector.tsx";
import { ProposalReview } from "./review.tsx";
import { go, Link, type Mode, type Route } from "./router.tsx";
import { ViewPanel, type Shown } from "./view-panel.tsx";

type GraphRoute = Exclude<Route, { page: "list" }>;

const MODES: { mode: Mode; name: string }[] = [
  { mode: "view", name: "View" },
  { mode: "edit", name: "Edit" },
];

const withPositions = (view: GraphView, positions: Record<string, Position>): GraphView => ({
  ...view,
  nodes: view.nodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position })),
});

const alignTo = (content: GraphContent, layout: Map<string, Position | null>): GraphContent => ({
  ...content,
  nodes: content.nodes.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position })),
});

const errorsOf = (error: unknown) => (error instanceof ApiError ? error.errors : [(error as Error).message]);

export const GraphPage = ({ route }: { route: GraphRoute }) => {
  const { graphId } = route;
  const mode: Mode = route.page === "graph" ? route.mode : "view";
  const [draft, setDraft] = useState<GraphView | null>(null);
  const [summary, setSummary] = useState<GraphSummary | null>(null);
  const [versions, setVersions] = useState<GraphVersionSummary[]>([]);
  const [proposals, setProposals] = useState<ProposalSummary[]>([]);
  const [missing, setMissing] = useState(false);
  const [picked, setPicked] = useState<Shown | null>(null);
  const [loadedVersions, setLoadedVersions] = useState<Record<number, GraphVersion>>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const loadDraft = useCallback(async () => {
    const next = await api.view(graphId);
    if (!next.nodes.some(({ position }) => position == null)) return next;
    const positions = autoLayout(next.nodes, next.edges, true);
    await api.moveNodes(graphId, positions);
    return withPositions(next, positions);
  }, [graphId]);

  const refresh = useCallback(async () => {
    const [nextDraft, nextVersions, nextProposals, graphs] = await Promise.all([
      loadDraft(),
      api.listVersions(graphId),
      api.listProposals(graphId),
      api.listGraphs(),
    ]);
    setDraft(nextDraft);
    setVersions(nextVersions);
    setProposals(nextProposals);
    setSummary(graphs.find(({ id }) => id === graphId) ?? null);
  }, [graphId, loadDraft]);

  const run = useCallback(
    async <T,>(action: () => Promise<T>) => {
      try {
        const result = await action();
        setErrors([]);
        setNotice(null);
        await refresh();
        return result;
      } catch (error) {
        setErrors(errorsOf(error));
        return undefined;
      }
    },
    [refresh],
  );

  useEffect(() => {
    refresh().catch((error: unknown) => {
      setMissing(error instanceof ApiError);
      setErrors(errorsOf(error));
    });
  }, [refresh]);

  const published = summary?.published ?? null;
  const shown: Shown = picked ?? published ?? "draft";

  useEffect(() => {
    if (shown === "draft" || loadedVersions[shown] != null) return;
    api
      .getVersion(graphId, shown)
      .then((version) => setLoadedVersions((current) => ({ ...current, [version.version]: version })))
      .catch((error: unknown) => setErrors(errorsOf(error)));
  }, [graphId, shown, loadedVersions]);

  const draftContent = useMemo(() => (draft == null ? null : toContent(draft)), [draft]);
  const layout = useMemo(() => new Map((draft?.nodes ?? []).map((node) => [node.id, node.position])), [draft]);
  const shownVersion = shown === "draft" ? undefined : loadedVersions[shown];
  const viewContent = useMemo(
    () => (shownVersion == null ? draftContent : alignTo(toContent(shownVersion.view), layout)),
    [shownVersion, draftContent, layout],
  );
  const content = mode === "edit" ? draftContent : viewContent;

  useEffect(() => {
    if (selection == null || content == null) return;
    const items = selection.kind === "node" ? content.nodes : content.edges;
    if (!items.some(({ id }) => id === selection.id)) setSelection(null);
  }, [content, selection]);

  const actions: InspectorActions = {
    updateGraph: (patch) => void run(() => api.updateGraph(graphId, patch)),
    deleteGraph: () => {
      api
        .deleteGraph(graphId)
        .then(() => go({ page: "list" }))
        .catch((error: unknown) => setErrors(errorsOf(error)));
    },
    updateNode: (id, patch) => void run(() => api.updateNode(id, patch)),
    removeNodeFromGraph: (id) => void run(() => api.removeNodeFromGraph(graphId, id)),
    updateEdge: (id, patch) => void run(() => api.updateEdge(id, patch)),
    removeEdgeFromGraph: (id) => void run(() => api.removeEdgeFromGraph(graphId, id)),
  };

  const addNode = async () => {
    const node = await run(() => api.createNodeInGraph(graphId, { name: "New node" }, null));
    if (node != null) setSelection({ kind: "node", id: node.id });
  };

  const relayout = () => {
    if (draft == null) return;
    void run(() => api.moveNodes(graphId, autoLayout(draft.nodes, draft.edges, false)));
  };

  const publish = async () => {
    const version = await run(() => api.publish(graphId));
    if (version == null) return;
    setPicked(null);
    setNotice(version.version === published ? `No changes since version ${version.version}.` : `Published version ${version.version}.`);
  };

  const move = (positions: Record<string, Position>) => {
    if (draft == null) return;
    setDraft(withPositions(draft, positions));
    api.moveNodes(graphId, positions).catch((error: unknown) => setErrors(errorsOf(error)));
  };

  const connect = async (source: string, target: string) => {
    const edge = await run(() => api.createEdgeInGraph(graphId, { source, target }));
    if (edge != null) setSelection({ kind: "edge", id: edge.id });
  };

  const remove = (nodeIds: string[], edgeIds: string[]) =>
    void run(async () => {
      for (const edgeId of edgeIds) await api.removeEdgeFromGraph(graphId, edgeId);
      for (const nodeId of nodeIds) await api.removeNodeFromGraph(graphId, nodeId);
    });

  const status =
    summary == null ? "" : published == null ? "Not published" : summary.changed ? `Draft: changes after version ${published}` : `Version ${published}`;

  const toolbarStart = (
    <>
      <Link className="back" to={{ page: "list" }}>
        ← Graphs
      </Link>
      <h1>{draft?.graph.name ?? ""}</h1>
      <span className={`status${summary?.changed ? " changed" : ""}`}>{status}</span>
      <div className="mode-tabs" role="tablist">
        {MODES.map((item) => (
          <Link
            key={item.mode}
            to={{ page: "graph", graphId, mode: item.mode }}
            role="tab"
            aria-selected={route.page === "graph" && mode === item.mode}
            className={route.page === "graph" && mode === item.mode ? "active" : ""}
          >
            {item.name}
          </Link>
        ))}
      </div>
    </>
  );

  const banner = (errors.length > 0 || notice != null) && (
    <div className={errors.length > 0 ? "banner errors" : "banner"}>
      {errors.length > 0 ? errors.map((error) => <div key={error}>{error}</div>) : notice}
    </div>
  );

  if (missing)
    return (
      <div className="app">
        <header className="toolbar">
          <Link className="back" to={{ page: "list" }}>
            ← Graphs
          </Link>
        </header>
        <p className="empty">{errors.join(" ")}</p>
      </div>
    );

  if (route.page === "proposal")
    return (
      <div className="app">
        <header className="toolbar">{toolbarStart}</header>
        {banner}
        {draft != null && (
          <ProposalReview
            key={route.proposalId}
            graphId={graphId}
            proposalId={route.proposalId}
            versions={versions}
            draft={draft}
            onClose={() => go({ page: "graph", graphId, mode: "view" })}
            onApplied={(message) => {
              go({ page: "graph", graphId, mode: "view" });
              void refresh().then(() => setNotice(message));
            }}
          />
        )}
      </div>
    );

  return (
    <div className="app">
      <header className="toolbar">
        {toolbarStart}
        <span className="spacer" />
        {mode === "view" && versions.length > 0 && (
          <select
            className="version-select"
            value={String(shown)}
            onChange={(e) => setPicked(e.target.value === "draft" ? "draft" : Number(e.target.value))}
            aria-label="Version to show"
          >
            <option value="draft">Draft</option>
            {versions.map((version) => (
              <option key={version.version} value={version.version}>
                Version {version.version}
                {version.version === published ? " (latest)" : ""}
              </option>
            ))}
          </select>
        )}
        {mode === "edit" && (
          <>
            <button type="button" onClick={() => void addNode()} disabled={draft == null}>
              Add node
            </button>
            <button type="button" onClick={relayout} disabled={draft == null || draft.nodes.length === 0}>
              Auto layout
            </button>
            <button type="button" className="primary" onClick={() => void publish()} disabled={summary == null || (published != null && !summary.changed)}>
              Publish
            </button>
          </>
        )}
        <a href="/docs" target="_blank" rel="noreferrer">
          API
        </a>
      </header>
      {banner}
      <div className="body">
        <main className="canvas">
          {content == null ? (
            <p className="empty">Loading the graph…</p>
          ) : (
            <ReactFlowProvider>
              <GraphCanvas
                view={content}
                selection={selection}
                onSelect={setSelection}
                onMove={move}
                onConnect={(source, target) => void connect(source, target)}
                onRemove={remove}
                readOnly={mode === "view"}
              >
                {mode === "view" && shown !== published && (
                  <Panel position="top-center" className="floating-note">
                    <span className="meta">
                      {shown === "draft" ? "The draft" : `Version ${shown}`}. The latest version is {published == null ? "not published" : published}.
                    </span>
                  </Panel>
                )}
              </GraphCanvas>
            </ReactFlowProvider>
          )}
        </main>
        <aside className="inspector">
          {mode === "edit" && draft != null && <Inspector view={draft} selection={selection} actions={actions} />}
          {mode === "view" && viewContent != null && (
            <ViewPanel
              graphId={graphId}
              content={viewContent}
              shown={shown}
              published={published}
              versions={versions}
              proposals={proposals}
              selection={selection}
              onSelect={setSelection}
              onShow={setPicked}
            />
          )}
        </aside>
      </div>
    </div>
  );
};
