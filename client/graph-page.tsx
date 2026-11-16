import { Panel, ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toContent } from "../diff.ts";
import { autoLayout } from "../layout.ts";
import type { GraphContent, GraphSummary, GraphVersion, GraphVersionSummary, GraphView, LayoutDirection, Position, ProposalSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { edgeText, GraphCanvas, type Selection } from "./canvas.tsx";
import { Inspector, type InspectorActions } from "./inspector.tsx";
import { ProposalReview } from "./review.tsx";
import { go, Link, type Route } from "./router.tsx";
import { useVocabulary } from "./vocabulary.ts";
import { GraphSections, VersionPanel, type Shown } from "./view-panel.tsx";

type GraphRoute = Exclude<Route, { page: "list" } | { page: "guide" }>;

const DIRECTIONS: { direction: LayoutDirection; name: string }[] = [
  { direction: "horizontal", name: "Horizontal" },
  { direction: "vertical", name: "Vertical" },
];

// Moves nodes in the local draft. Like the server, it removes the routes of the edges of each moved node.
const withPositions = (view: GraphView, positions: Record<string, Position>): GraphView => ({
  ...view,
  nodes: view.nodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position })),
  edges: view.edges.map((edge) => (edge.source in positions || edge.target in positions ? { ...edge, route: null } : edge)),
});

const alignTo = (content: GraphContent, layout: Map<string, Position | null>): GraphContent => ({
  ...content,
  nodes: content.nodes.map((node) => ({ ...node, position: layout.get(node.id) ?? node.position })),
});

const errorsOf = (error: unknown) => (error instanceof ApiError ? error.errors : [(error as Error).message]);

export const GraphPage = ({ route }: { route: GraphRoute }) => {
  const { graphId } = route;
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
  // The number of changes that are on their way to the server. Every change saves at once, so the draft is saved when
  // this is 0.
  const [saving, setSaving] = useState(0);
  const vocabulary = useVocabulary();

  const loadDraft = useCallback(async () => {
    const next = await api.view(graphId);
    if (!next.nodes.some(({ position }) => position == null)) return next;
    const { positions } = await autoLayout(next.nodes, next.edges, true, next.graph.direction, (edge) => edgeText(edge, vocabulary));
    await api.moveNodes(graphId, positions);
    return withPositions(next, positions);
  }, [graphId, vocabulary]);

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
      setSaving((count) => count + 1);
      try {
        const result = await action();
        setErrors([]);
        setNotice(null);
        await refresh();
        return result;
      } catch (error) {
        setErrors(errorsOf(error));
        return undefined;
      } finally {
        setSaving((count) => count - 1);
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
  // The page shows the draft, which you can edit. A published version shows read-only until you go back to the draft.
  const shown: Shown = picked ?? "draft";
  const readOnly = shown !== "draft";

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
  const content = viewContent;
  // The saved edge routes belong to the draft. A shown version uses the draft positions, so it uses the route of each edge
  // that connects the same two nodes in the draft.
  const routes = useMemo(() => {
    const saved = new Map((draft?.edges ?? []).map((edge) => [edge.id, edge]));
    return new Map(
      (content?.edges ?? []).flatMap(({ id, source, target }) => {
        const edge = saved.get(id);
        return edge?.route != null && edge.source === source && edge.target === target ? [[id, edge.route] as const] : [];
      }),
    );
  }, [draft, content]);

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

  const relayout = (direction: LayoutDirection) => {
    if (draft == null) return;
    void run(async () => {
      if (direction !== draft.graph.direction) await api.updateGraph(graphId, { direction });
      await api.setLayout(graphId, await autoLayout(draft.nodes, draft.edges, false, direction, (edge) => edgeText(edge, vocabulary)));
    });
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
    setSaving((count) => count + 1);
    api
      .moveNodes(graphId, positions)
      .catch((error: unknown) => setErrors(errorsOf(error)))
      .finally(() => setSaving((count) => count - 1));
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
    saving > 0
      ? "Saving…"
      : summary == null
        ? ""
        : published == null
          ? "Draft saved · not published"
          : summary.changed
            ? `Draft saved · changes since version ${published}`
            : `Draft saved · same as version ${published}`;

  const toolbarStart = (
    <>
      <Link className="back" to={{ page: "list" }}>
        ← Graphs
      </Link>
      <h1>{draft?.graph.name ?? ""}</h1>
    </>
  );

  const sections = (
    <GraphSections graphId={graphId} shown={shown} published={published} versions={versions} proposals={proposals} onShow={setPicked} />
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
            onClose={() => go({ page: "graph", graphId })}
            onApplied={(message) => {
              go({ page: "graph", graphId });
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
        <div className="tabs" role="group" aria-label="Layout direction">
          {DIRECTIONS.map((item) => (
            <button
              key={item.direction}
              type="button"
              className={draft?.graph.direction === item.direction ? "active" : ""}
              aria-pressed={draft?.graph.direction === item.direction}
              onClick={() => relayout(item.direction)}
              disabled={draft == null || readOnly}
            >
              {item.name}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => void addNode()} disabled={draft == null || readOnly}>
          Add node
        </button>
        <button type="button" onClick={() => relayout(draft?.graph.direction ?? "horizontal")} disabled={draft == null || readOnly || draft.nodes.length === 0}>
          Auto layout
        </button>
        {versions.length > 0 && (
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
        <button
          type="button"
          className="primary"
          onClick={() => void publish()}
          disabled={summary == null || saving > 0 || (published != null && !summary.changed)}
          title="Save the draft as a new version that does not change"
        >
          Publish
        </button>
        <Link to={{ page: "guide" }}>Guide</Link>
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
                routes={routes}
                selection={selection}
                onSelect={setSelection}
                onMove={move}
                onConnect={(source, target) => void connect(source, target)}
                onRemove={remove}
                readOnly={readOnly}
              >
                {!readOnly && status !== "" && (
                  <Panel position="top-right" className={`floating-note save-status${saving === 0 && summary?.changed === true ? " changed" : ""}`}>
                    <span aria-live="polite">{status}</span>
                  </Panel>
                )}
                {readOnly && (
                  <Panel position="top-center" className="floating-note">
                    <span className="meta">Version {shown} is read-only. </span>
                    <button type="button" className="link" onClick={() => setPicked("draft")}>
                      Back to the draft
                    </button>
                  </Panel>
                )}
              </GraphCanvas>
            </ReactFlowProvider>
          )}
        </main>
        <aside className="inspector">
          {!readOnly && draft != null && (
            <>
              <Inspector view={draft} selection={selection} actions={actions} />
              {selection == null && sections}
            </>
          )}
          {readOnly && viewContent != null && (
            <VersionPanel graphId={graphId} content={viewContent} selection={selection} onSelect={setSelection}>
              {sections}
            </VersionPanel>
          )}
        </aside>
      </div>
    </div>
  );
};
