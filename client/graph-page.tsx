import { Panel, ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toContent } from "../diff.ts";
import { autoLayout } from "../layout.ts";
import type { FlowStep, Run, GraphContent, GraphEdge, GraphSummary, GraphVersion, GraphVersionSummary, GraphView, LayoutDirection, Position, ProposalSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { edgeText, GraphCanvas, type Selection } from "./canvas.tsx";
import { FlowPanel, FlowsSection, pathOf, RunPanel, type FlowActions, type RunActions } from "./flow-panel.tsx";
import { GraphFooter, GraphTitle, Inspector, type InspectorActions } from "./inspector.tsx";
import { MenuButton } from "./menu.tsx";
import { ProposalReview } from "./review.tsx";
import { go, Link, type Route } from "./router.tsx";
import { termName } from "../vocabulary.ts";
import { useVocabulary } from "./vocabulary.ts";
import { EMPTY_HISTORY, movedTo, recordChange, snapshotOf, stateAt, type History } from "./history.ts";
import { GraphSections, HistorySection, VersionPanel, type Shown } from "./view-panel.tsx";

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

const goesFrom = (edge: GraphEdge, from: string, to: string) =>
  (edge.source === from && edge.target === to) || (!edge.directed && edge.source === to && edge.target === from);

const MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
const UNDO_KEY = MAC ? "⌘Z" : "Ctrl+Z";
const REDO_KEY = MAC ? "⇧⌘Z" : "Ctrl+Shift+Z";

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
  const [flowId, setFlowId] = useState<string | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  // The number of changes that are on their way to the server. Every change saves at once, so the draft is saved when
  // this is 0.
  const [saving, setSaving] = useState(0);
  const [history, setHistory] = useState<History>(EMPTY_HISTORY);
  const vocabulary = useVocabulary();

  const loadDraft = useCallback(async () => {
    const next = await api.view(graphId);
    if (!next.nodes.some(({ position }) => position == null)) return next;
    const { positions } = await autoLayout(next.nodes, next.edges, true, next.graph.direction, (edge) => edgeText(edge, vocabulary));
    await api.moveNodes(graphId, positions);
    return withPositions(next, positions);
  }, [graphId, vocabulary]);

  const refresh = useCallback(async () => {
    const [nextDraft, nextVersions, nextProposals, graphs, nextRuns] = await Promise.all([
      loadDraft(),
      api.listVersions(graphId),
      api.listProposals(graphId),
      api.listGraphs(),
      api.listRuns(graphId),
    ]);
    setDraft(nextDraft);
    setRuns(nextRuns);
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

  const flows = (readOnly ? shownVersion?.view.flows : draft?.flows) ?? [];
  const flow = flows.find(({ id }) => id === flowId);
  const flowRuns = runs.filter((item) => item.flowId === flow?.id);
  const openRun = flowRuns.find(({ id }) => id === runId);
  const reached = openRun?.events.length;
  const path = useMemo(() => (flow == null ? undefined : pathOf(flow, reached)), [flow, reached]);

  const nodeName = (id: string) => draft?.nodes.find((node) => node.id === id)?.name ?? "node";
  const edgeName = (id: string) => {
    const edge = draft?.edges.find((item) => item.id === id);
    if (edge == null) return "edge";
    const text = edgeText(edge, vocabulary);
    return text !== "" ? `edge "${text}"` : `edge ${nodeName(edge.source)} → ${nodeName(edge.target)}`;
  };

  // Makes one change to the draft and records it in the undo history.
  const change = async <T,>(label: string, action: () => Promise<T>) => {
    const before = draft == null ? null : snapshotOf(draft);
    let done = false;
    const result = await run(async () => {
      const value = await action();
      done = true;
      return value;
    });
    if (done && before != null) setHistory((current) => recordChange(current, label, before));
    return result;
  };

  // Puts the draft back to the state after the first `index` changes of the history: undo, redo, or a jump in the list.
  const goToHistory = async (index: number) => {
    if (draft == null || readOnly || saving > 0 || index === history.index) return;
    const current = snapshotOf(draft);
    const target = stateAt(history, index, current);
    if (target == null) return;
    let done = false;
    await run(async () => {
      await api.restoreDraft(graphId, target);
      done = true;
    });
    if (done) setHistory(movedTo(history, index, current));
  };
  const undo = () => void goToHistory(history.index - 1);
  const redo = () => void goToHistory(history.index + 1);
  const canUndo = !readOnly && history.index > 0;
  const canRedo = !readOnly && history.index < history.entries.length;

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const isRedo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      if (key !== "z" && !isRedo) return;
      const target = event.target as HTMLElement | null;
      // Text fields keep their own undo for the text you type.
      if (target != null && (target.closest("input, textarea, select") != null || target.isContentEditable)) return;
      event.preventDefault();
      if (isRedo) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const actions: InspectorActions = {
    updateGraph: (patch) => void change(patch.name != null ? "Rename the graph" : "Edit the graph purpose", () => api.updateGraph(graphId, patch)),
    deleteGraph: () => {
      api
        .deleteGraph(graphId)
        .then(() => go({ page: "list" }))
        .catch((error: unknown) => setErrors(errorsOf(error)));
    },
    updateNode: (id, patch) =>
      void change(patch.name != null ? `Rename "${nodeName(id)}" to "${patch.name}"` : `Edit "${nodeName(id)}"`, () => api.updateNode(id, patch)),
    removeNodeFromGraph: (id) => void change(`Delete "${nodeName(id)}"`, () => api.removeNodeFromGraph(graphId, id)),
    updateEdge: (id, patch) => void change(`Edit ${edgeName(id)}`, () => api.updateEdge(id, patch)),
    removeEdgeFromGraph: (id) => void change(`Delete ${edgeName(id)}`, () => api.removeEdgeFromGraph(graphId, id)),
  };

  const addNode = async (type: string | null, position: Position) => {
    const name = `New ${(termName(vocabulary.nodeTypes, type) ?? "node").toLowerCase()}`;
    const node = await change(`Add "${name}"`, () => api.createNodeInGraph(graphId, { name, type }, position));
    if (node != null) setSelection({ kind: "node", id: node.id });
  };

  const relayout = (direction: LayoutDirection) => {
    if (draft == null) return;
    const label = direction === draft.graph.direction ? "Auto layout" : `Change to the ${direction} layout`;
    void change(label, async () => {
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
    const ids = Object.keys(positions);
    const label = ids.length === 1 ? `Move "${nodeName(ids[0] ?? "")}"` : `Move ${ids.length} nodes`;
    const before = snapshotOf(draft);
    setDraft(withPositions(draft, positions));
    setSaving((count) => count + 1);
    api
      .moveNodes(graphId, positions)
      .then(() => setHistory((current) => recordChange(current, label, before)))
      .catch((error: unknown) => setErrors(errorsOf(error)))
      .finally(() => setSaving((count) => count - 1));
  };

  const connect = async (source: string, target: string) => {
    const edge = await change(`Add edge ${nodeName(source)} → ${nodeName(target)}`, () => api.createEdgeInGraph(graphId, { source, target }));
    if (edge != null) setSelection({ kind: "edge", id: edge.id });
  };

  const remove = (nodeIds: string[], edgeIds: string[]) => {
    const count = nodeIds.length + edgeIds.length;
    const label =
      count !== 1 ? `Delete ${count} items` : nodeIds[0] != null ? `Delete "${nodeName(nodeIds[0])}"` : `Delete ${edgeName(edgeIds[0] ?? "")}`;
    void change(label, async () => {
      for (const edgeId of edgeIds) await api.removeEdgeFromGraph(graphId, edgeId);
      for (const nodeId of nodeIds) await api.removeNodeFromGraph(graphId, nodeId);
    });
  };

  const openFlow = (id: string) => {
    setSelection(null);
    setRunId(null);
    setFlowId(id);
  };

  // A run shows on the version it uses, so the canvas shows the graph and the flow that the run follows.
  const showRun = (item: Run) => {
    setSelection(null);
    setPicked(item.version);
    setFlowId(item.flowId);
    setRunId(item.id);
  };

  const runActions: RunActions = {
    advance: (note) => {
      if (openRun != null) void run(() => api.advanceRun(graphId, openRun.id, note));
    },
    finish: (status) => {
      if (openRun != null) void run(() => api.finishRun(graphId, openRun.id, { status }));
    },
    close: () => setRunId(null),
  };

  const createFlow = async (name: string) => {
    const created = await run(() => api.createFlow(graphId, { name }));
    if (created != null) openFlow(created.id);
  };

  const saveSteps = (steps: FlowStep[]) => {
    if (flow != null) void run(() => api.updateFlow(graphId, flow.id, { steps }));
  };

  const flowActions: FlowActions = {
    update: (patch) => {
      if (flow != null) void run(() => api.updateFlow(graphId, flow.id, patch));
    },
    truncate: (length) => saveSteps(flow?.steps.slice(0, length) ?? []),
    remove: () => {
      if (flow != null) void run(() => api.deleteFlow(graphId, flow.id)).then(() => setFlowId(null));
    },
    close: () => {
      setFlowId(null);
      setRunId(null);
    },
    startRun: () => {
      if (flow == null || published == null) return;
      void run(() => api.startRun(graphId, flow.id, published)).then((created) => {
        if (created != null) showRun(created);
      });
    },
    openRun: showRun,
  };

  // The steps of the open flow with one more step for a click on a node or an edge, or why the click cannot add one.
  const nextSteps = (steps: FlowStep[], clicked: NonNullable<Selection>): FlowStep[] | string => {
    const edges = draft?.edges ?? [];
    const last = steps.at(-1)?.nodeId;
    if (clicked.kind === "node") {
      if (last == null) return [{ nodeId: clicked.id, edgeId: null }];
      const found = edges.filter((edge) => goesFrom(edge, last, clicked.id));
      if (found.length === 0) return `No edge goes from "${nodeName(last)}" to "${nodeName(clicked.id)}".`;
      if (found.length > 1) return `More than one edge goes from "${nodeName(last)}" to "${nodeName(clicked.id)}". Click the edge to follow.`;
      return [...steps, { nodeId: clicked.id, edgeId: found[0]?.id ?? null }];
    }
    const edge = edges.find(({ id }) => id === clicked.id);
    if (edge == null) return [];
    if (last == null) return [{ nodeId: edge.source, edgeId: null }, { nodeId: edge.target, edgeId: edge.id }];
    const to = goesFrom(edge, last, edge.target) ? edge.target : goesFrom(edge, last, edge.source) ? edge.source : null;
    if (to == null) return `The edge does not start at "${nodeName(last)}".`;
    return [...steps, { nodeId: to, edgeId: edge.id }];
  };

  // While a flow is open in the draft, a click on the canvas adds a step instead of a selection.
  const select = (next: Selection) => {
    if (flow == null) {
      setSelection(next);
    } else if (readOnly) {
      setFlowId(null);
      setRunId(null);
      setSelection(next);
    } else if (next != null) {
      const steps = nextSteps(flow.steps, next);
      if (typeof steps === "string") setErrors([steps]);
      else saveSteps(steps);
    }
  };
  const selectRef = useRef(select);
  selectRef.current = select;
  const onSelect = useCallback((next: Selection) => selectRef.current(next), []);

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
      <Link className="back" to={{ page: "list" }} aria-label="Back to graphs" title="Back to graphs">
        ←
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
          <Link className="back" to={{ page: "list" }} aria-label="Back to graphs" title="Back to graphs">
            ←
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
              setHistory(EMPTY_HISTORY);
              go({ page: "graph", graphId });
              void refresh().then(() => setNotice(message));
            }}
          />
        )}
      </div>
    );

  return (
    <div className="app">
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
                onSelect={onSelect}
                path={path}
                onMove={move}
                onConnect={(source, target) => void connect(source, target)}
                onRemove={remove}
                onAddNode={(type, position) => void addNode(type, position)}
                paletteFooter={
                  <div className="palette history-controls" role="group" aria-label="History">
                    <button
                      type="button"
                      className="palette-tool"
                      onClick={undo}
                      disabled={!canUndo || saving > 0}
                      aria-label="Undo"
                      title={`Undo${canUndo ? `: ${history.entries[history.index - 1]?.label ?? ""}` : ""} (${UNDO_KEY})`}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M3 7v6h6" />
                        <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      className="palette-tool"
                      onClick={redo}
                      disabled={!canRedo || saving > 0}
                      aria-label="Redo"
                      title={`Redo${canRedo ? `: ${history.entries[history.index]?.label ?? ""}` : ""} (${REDO_KEY})`}
                    >
                      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 7v6h-6" />
                        <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
                      </svg>
                    </button>
                  </div>
                }
                readOnly={readOnly}
              >
                <Panel position="top-left" className="floating-note title-panel">
                  <Link className="back" to={{ page: "list" }} aria-label="Back to graphs" title="Back to graphs">
                    ←
                  </Link>
                  {readOnly || draft == null ? (
                    <h1 title={draft?.graph.name}>{draft?.graph.name ?? ""}</h1>
                  ) : (
                    <GraphTitle name={draft.graph.name} onRename={(name) => actions.updateGraph({ name })} />
                  )}
                  <MenuButton
                    label="Graph actions"
                    icon={
                      <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
                        <circle cx="12" cy="5" r="1.8" />
                        <circle cx="12" cy="12" r="1.8" />
                        <circle cx="12" cy="19" r="1.8" />
                      </svg>
                    }
                    items={[
                      {
                        label: "Delete graph",
                        danger: true,
                        onSelect: () => {
                          if (confirm(`Delete the graph "${draft?.graph.name ?? ""}"? Its nodes and edges are deleted too.`)) actions.deleteGraph();
                        },
                      },
                    ]}
                  />
                </Panel>
                <Panel position="bottom-right" className="direction-panel">
                  <button
                    type="button"
                    className="floating-button"
                    onClick={() => relayout(draft?.graph.direction ?? "horizontal")}
                    disabled={draft == null || readOnly || draft.nodes.length === 0}
                  >
                    Auto layout
                  </button>
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
                </Panel>
                <Panel position="top-right" className="floating-note publish-panel">
                  {!readOnly && status !== "" && (
                    <span className={`save-status${saving === 0 && summary?.changed === true ? " changed" : ""}`} aria-live="polite">
                      {status}
                    </span>
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
                </Panel>
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
          {flow != null && content != null && openRun != null && <RunPanel key={openRun.id} run={openRun} flow={flow} content={content} actions={runActions} />}
          {flow != null && content != null && openRun == null && (
            <FlowPanel
              flow={flow}
              content={content}
              readOnly={readOnly}
              runs={flowRuns}
              canRun={published == null ? "Publish the graph to run its flows." : null}
              actions={flowActions}
            />
          )}
          {flow == null && !readOnly && draft != null && draftContent != null && (
            <>
              <Inspector view={draft} selection={selection} actions={actions} />
              {selection == null && (
                <>
                  <FlowsSection flows={flows} content={draftContent} onOpen={openFlow} onCreate={(name) => void createFlow(name)} />
                  {sections}
                  <HistorySection history={history} undoKey={UNDO_KEY} redoKey={REDO_KEY} onGo={(index) => void goToHistory(index)} disabled={saving > 0} />
                  <GraphFooter view={draft} />
                </>
              )}
            </>
          )}
          {flow == null && readOnly && viewContent != null && (
            <VersionPanel graphId={graphId} content={viewContent} selection={selection} onSelect={setSelection}>
              <FlowsSection flows={flows} content={viewContent} onOpen={openFlow} />
              {sections}
            </VersionPanel>
          )}
        </aside>
      </div>
    </div>
  );
};
