import { ReactFlowProvider } from "@xyflow/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { countChanges, diffGraphs, hasChanges, toContent } from "../diff.ts";
import { NODE_HEIGHT, NODE_WIDTH, autoLayout } from "../layout.ts";
import type {
  ContentEdge,
  ContentNode,
  EdgeChange,
  FieldChange,
  GraphContent,
  GraphDiff,
  GraphVersionSummary,
  GraphView,
  NodeChange,
  Position,
  Proposal,
} from "../model.ts";
import { ApiError, api } from "./api.ts";
import { GraphCanvas, type Marks, type Selection } from "./canvas.tsx";

type Against = number | "latest" | "draft";
type Base = number | "draft" | "empty";
type Names = Map<string, string>;

const STATUS_TEXT = { added: "Added", removed: "Removed", changed: "Changed", unchanged: "Unchanged" };

const baseName = (base: Base) => (base === "draft" ? "the draft" : base === "empty" ? "an empty graph" : `published version ${base}`);

const formatValue = (field: string, value: unknown, names: Names) => {
  if (value === undefined || value === null || value === "") return "—";
  if ((field === "source" || field === "target") && typeof value === "string") return names.get(value) ?? value;
  if (Array.isArray(value)) return value.length === 0 ? "—" : value.join(", ");
  if (typeof value === "string") return value;
  if (typeof value === "boolean" && field === "directed") return value ? "directed" : "undirected";
  return JSON.stringify(value);
};

const propertyFields = (properties: ContentNode["properties"]): [string, unknown][] =>
  Object.entries(properties).map(([key, value]) => [`properties.${key}`, value]);

const nodeFields = (node: ContentNode): [string, unknown][] => [
  ["type", node.type],
  ["status", node.status],
  ["description", node.description],
  ["intent", node.intent],
  ["labels", node.labels],
  ...propertyFields(node.properties),
];

const edgeFields = (edge: ContentEdge): [string, unknown][] => [
  ["source", edge.source],
  ["target", edge.target],
  ["directed", edge.directed],
  ["type", edge.type],
  ["label", edge.label],
  ["status", edge.status],
  ["description", edge.description],
  ["intent", edge.intent],
  ...propertyFields(edge.properties),
];

const edgeName = (edge: ContentEdge) => (edge.label !== "" ? edge.label : (edge.type ?? ""));

const edgeTitle = (edge: ContentEdge, names: Names) =>
  `${names.get(edge.source) ?? edge.source} ${edge.directed ? "→" : "—"} ${names.get(edge.target) ?? edge.target}${edgeName(edge) === "" ? "" : ` (${edgeName(edge)})`}`;

const FieldTable = ({ fields, names }: { fields: FieldChange[]; names: Names }) => (
  <table className="field-table">
    <thead>
      <tr>
        <th>Field</th>
        <th>Before</th>
        <th>After</th>
      </tr>
    </thead>
    <tbody>
      {fields.map(({ field, before, after }) => (
        <tr key={field}>
          <td className="mono">{field}</td>
          <td className="before">{formatValue(field, before, names)}</td>
          <td className="after">{formatValue(field, after, names)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);

const ValueList = ({ values, names }: { values: [string, unknown][]; names: Names }) => {
  const shown = values.filter(([field, value]) => formatValue(field, value, names) !== "—");
  if (shown.length === 0) return null;
  return (
    <dl className="value-list">
      {shown.map(([field, value]) => (
        <div key={field}>
          <dt className="mono">{field}</dt>
          <dd>{formatValue(field, value, names)}</dd>
        </div>
      ))}
    </dl>
  );
};

const Entry = ({
  change,
  title,
  values,
  names,
  shared,
  onSelect,
}: {
  change: NodeChange | EdgeChange;
  title: string;
  values: [string, unknown][];
  names: Names;
  shared?: string[];
  onSelect?: () => void;
}) => (
  <article className={`entry mark-${change.status}`}>
    <header>
      <span className={`badge badge-${change.status}`}>{STATUS_TEXT[change.status]}</span>
      {onSelect == null ? <strong>{title}</strong> : (
        <button type="button" className="link" onClick={onSelect}>
          {title}
        </button>
      )}
    </header>
    {change.status === "changed" && <FieldTable fields={change.fields} names={names} />}
    {change.status !== "changed" && <ValueList values={values} names={names} />}
    {change.status === "changed" && shared != null && shared.length > 0 && (
      <p className="warning">This node is also in {shared.join(", ")}. The change applies there too.</p>
    )}
  </article>
);

const NodeEntry = ({ change, names, proposal, onSelect }: { change: NodeChange; names: Names; proposal: Proposal; onSelect?: () => void }) => {
  const node = change.after ?? change.before;
  if (node == null) return null;
  return <Entry change={change} title={node.name} values={nodeFields(node)} names={names} shared={proposal.sharedWith[change.id]} onSelect={onSelect} />;
};

const EdgeEntry = ({ change, names, onSelect }: { change: EdgeChange; names: Names; onSelect?: () => void }) => {
  const edge = change.after ?? change.before;
  if (edge == null) return null;
  return <Entry change={change} title={edgeTitle(edge, names)} values={edgeFields(edge)} names={names} onSelect={onSelect} />;
};

const Counts = ({ added, removed, changed }: { added: number; removed: number; changed: number }) => (
  <span className="counts">
    <span className="count-added">+{added}</span> <span className="count-removed">−{removed}</span> <span className="count-changed">~{changed}</span>
  </span>
);

const Ledger = ({
  diff,
  base,
  names,
  proposal,
  onSelect,
}: {
  diff: GraphDiff;
  base: Base;
  names: Names;
  proposal: Proposal;
  onSelect: (selection: Selection) => void;
}) => {
  const counts = countChanges(diff);
  const nodes = diff.nodes.filter(({ status }) => status !== "unchanged");
  const edges = diff.edges.filter(({ status }) => status !== "unchanged");
  const unchanged = diff.nodes.length - nodes.length;
  return (
    <div className="ledger">
      <h1>{proposal.title}</h1>
      <p className="hint">Changes from {baseName(base)} to the proposal.</p>
      {!hasChanges(diff) && <p className="empty">The proposal is the same as {baseName(base)}.</p>}
      {diff.graph.length > 0 && (
        <section>
          <h2>Graph</h2>
          <FieldTable fields={diff.graph} names={names} />
        </section>
      )}
      {nodes.length > 0 && (
        <section>
          <h2>
            Nodes <Counts {...counts.nodes} />
          </h2>
          {nodes.map((change) => (
            <NodeEntry
              key={change.id}
              change={change}
              names={names}
              proposal={proposal}
              onSelect={() => onSelect({ kind: "node", id: change.id })}
            />
          ))}
        </section>
      )}
      {edges.length > 0 && (
        <section>
          <h2>
            Edges <Counts {...counts.edges} />
          </h2>
          {edges.map((change) => (
            <EdgeEntry key={change.id} change={change} names={names} onSelect={() => onSelect({ kind: "edge", id: change.id })} />
          ))}
        </section>
      )}
      {(unchanged > 0 || counts.moved > 0) && (
        <p className="hint">
          {unchanged} nodes and {diff.edges.length - edges.length} edges do not change.
          {counts.moved > 0 && ` ${counts.moved} of the nodes only move.`}
        </p>
      )}
    </div>
  );
};

const mergedContent = (diff: GraphDiff, proposal: Proposal): GraphContent => {
  const nodes = diff.nodes.flatMap(({ after, before }) => (after ?? before) ?? []);
  const edges = diff.edges.flatMap(({ after, before }) => (after ?? before) ?? []);
  const positions = autoLayout(nodes, edges, true);
  const placed = nodes.map((node) => ({ ...node, position: node.position ?? positions[node.id] ?? null }));
  const removed = new Set(diff.nodes.filter(({ status }) => status === "removed").map(({ id }) => id));
  const taken = placed.flatMap(({ id, position }) => (removed.has(id) || position == null ? [] : [position]));
  const overlaps = (position: Position) =>
    taken.some(({ x, y }) => Math.abs(x - position.x) < NODE_WIDTH && Math.abs(y - position.y) < NODE_HEIGHT + 20);
  const spread = placed.map((node) => {
    if (!removed.has(node.id) || node.position == null) return node;
    let position = node.position;
    while (overlaps(position)) position = { x: position.x, y: position.y + NODE_HEIGHT + 40 };
    taken.push(position);
    return { ...node, position };
  });
  return { graph: proposal.content.graph, nodes: spread, edges };
};

const Legend = () => (
  <div className="legend">
    {(["added", "removed", "changed"] as const).map((status) => (
      <span key={status} className={`badge badge-${status}`}>
        {STATUS_TEXT[status]}
      </span>
    ))}
  </div>
);

export const ProposalReview = ({
  graphId,
  proposalId,
  versions,
  draft,
  onClose,
  onApplied,
}: {
  graphId: string;
  proposalId: string;
  versions: GraphVersionSummary[];
  draft: GraphView;
  onClose: () => void;
  onApplied: (notice: string) => void;
}) => {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [against, setAgainst] = useState<Against>("latest");
  const [result, setResult] = useState<{ against: Base; diff: GraphDiff } | null>(null);
  const [tab, setTab] = useState<"ledger" | "graph">("ledger");
  const [selection, setSelection] = useState<Selection>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [draftDirty, setDraftDirty] = useState(false);

  const report = (error: unknown) => {
    if (error instanceof ApiError) setErrors(error.errors);
    else throw error;
  };

  const load = useCallback(async () => {
    const [nextProposal, nextResult] = await Promise.all([api.getProposal(graphId, proposalId), api.diffProposal(graphId, proposalId, against)]);
    setProposal(nextProposal);
    setResult(nextResult);
    setErrors([]);
  }, [graphId, proposalId, against]);

  useEffect(() => {
    load().catch(report);
  }, [load]);

  useEffect(() => {
    if (versions.length === 0) {
      setDraftDirty(false);
      return;
    }
    api
      .getVersion(graphId, "latest")
      .then((latest) => setDraftDirty(hasChanges(diffGraphs(toContent(latest.view), toContent(draft)))))
      .catch(report);
  }, [graphId, versions, draft]);

  const names = useMemo(
    () => new Map(result?.diff.nodes.flatMap(({ id, after, before }) => [[id, (after ?? before)?.name ?? id] as const]) ?? []),
    [result],
  );
  const merged = useMemo(() => (result == null || proposal == null ? null : mergedContent(result.diff, proposal)), [result, proposal]);
  const marks = useMemo<Marks | undefined>(
    () =>
      result == null
        ? undefined
        : {
            nodes: new Map(result.diff.nodes.map(({ id, status }) => [id, status])),
            edges: new Map(result.diff.edges.map(({ id, status }) => [id, status])),
          },
    [result],
  );

  const apply = async (publish: boolean) => {
    try {
      const applied = await api.applyProposal(graphId, proposalId, publish);
      onApplied(applied.version == null ? `Applied "${applied.proposal.title}" to the draft.` : `Applied "${applied.proposal.title}" and published version ${applied.version.version}.`);
    } catch (error) {
      report(error);
    }
  };

  const discard = async () => {
    try {
      await api.discardProposal(graphId, proposalId);
      await load();
    } catch (error) {
      report(error);
    }
  };

  const select = (next: Selection) => {
    setSelection(next);
    if (next != null) setTab("graph");
  };

  const latest = versions[0]?.version ?? null;
  const stale = proposal != null && latest != null && proposal.baseVersion !== latest;
  const selectedNode = selection?.kind === "node" ? result?.diff.nodes.find(({ id }) => id === selection.id) : undefined;
  const selectedEdge = selection?.kind === "edge" ? result?.diff.edges.find(({ id }) => id === selection.id) : undefined;
  const counts = result == null ? null : countChanges(result.diff);

  return (
    <div className="review">
      <main className="canvas-pane">
        <div className="toolbar">
          <div className="toolbar-actions">
            <button type="button" onClick={onClose}>
              ← Back to graph
            </button>
            <div className="tabs" role="tablist">
              <button type="button" role="tab" aria-selected={tab === "ledger"} className={tab === "ledger" ? "active" : undefined} onClick={() => setTab("ledger")}>
                Ledger
              </button>
              <button type="button" role="tab" aria-selected={tab === "graph"} className={tab === "graph" ? "active" : undefined} onClick={() => setTab("graph")}>
                Graph
              </button>
            </div>
          </div>
          <label className="against">
            <span>Compare with</span>
            <select
              value={String(against)}
              onChange={(e) => setAgainst(e.target.value === "latest" || e.target.value === "draft" ? e.target.value : Number(e.target.value))}
            >
              <option value="latest">{latest == null ? "Published (none)" : `Published, latest (v${latest})`}</option>
              {versions.slice(1).map(({ version }) => (
                <option key={version} value={version}>
                  Published v{version}
                </option>
              ))}
              <option value="draft">Draft (editable graph)</option>
            </select>
          </label>
        </div>
        {errors.length > 0 && (
          <ul className="errors">
            {errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        )}
        <div className="canvas">
          {result == null || proposal == null || merged == null ? (
            <p className="empty">Loading the proposal.</p>
          ) : tab === "ledger" ? (
            <Ledger diff={result.diff} base={result.against} names={names} proposal={proposal} onSelect={select} />
          ) : (
            <ReactFlowProvider key={`${proposalId}:${String(result.against)}`}>
              <GraphCanvas view={merged} selection={selection} onSelect={setSelection} marks={marks} readOnly />
              <Legend />
            </ReactFlowProvider>
          )}
        </div>
      </main>
      <aside className="inspector">
        {proposal == null ? (
          <p className="hint">Loading.</p>
        ) : (
          <>
            <section className="section">
              <h2>Proposal</h2>
              <p className="proposal-title">{proposal.title}</p>
              <div>
                <span className={`badge badge-status-${proposal.status}`}>{proposal.status}</span>
              </div>
              {proposal.workItem !== "" && (
                <div className="field">
                  <span>Work item</span>
                  {/^https?:\/\//.test(proposal.workItem) ? (
                    <a href={proposal.workItem} target="_blank" rel="noreferrer">
                      {proposal.workItem}
                    </a>
                  ) : (
                    <strong>{proposal.workItem}</strong>
                  )}
                </div>
              )}
              {proposal.rationale !== "" && (
                <div className="field">
                  <span>Why</span>
                  <p className="rationale">{proposal.rationale}</p>
                </div>
              )}
              <p className="hint">
                Made from {proposal.baseVersion == null ? "an unpublished graph" : `version ${proposal.baseVersion}`} on {new Date(proposal.createdAt).toLocaleString()}.
              </p>
              {proposal.status === "open" && stale && (
                <p className="warning">Version {latest} was published after this proposal was made. Check the ledger against the latest version.</p>
              )}
              {counts != null && result != null && (
                <p className="hint">
                  Against {baseName(result.against)}: nodes <Counts {...counts.nodes} />, edges <Counts {...counts.edges} />.
                </p>
              )}
              {proposal.status === "open" && (
                <>
                  {draftDirty && <p className="warning">The draft has edits that are not published. Apply replaces them.</p>}
                  <div className="row">
                    <button type="button" className="primary" onClick={() => void apply(true)}>
                      Apply and publish
                    </button>
                    <button type="button" onClick={() => void apply(false)}>
                      Apply to draft
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => {
                        if (confirm(`Discard "${proposal.title}"? The graph does not change.`)) void discard();
                      }}
                    >
                      Discard
                    </button>
                  </div>
                </>
              )}
              <p className="mono">{proposal.id}</p>
            </section>
            {selectedNode != null && (
              <section className="section">
                <h2>Selected node</h2>
                <NodeEntry change={selectedNode} names={names} proposal={proposal} />
              </section>
            )}
            {selectedEdge != null && (
              <section className="section">
                <h2>Selected edge</h2>
                <EdgeEntry change={selectedEdge} names={names} />
              </section>
            )}
          </>
        )}
      </aside>
    </div>
  );
};
