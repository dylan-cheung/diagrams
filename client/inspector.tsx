import { normalizeLabels, type GraphEdge, type GraphInput, type GraphNode, type GraphVersionSummary, type GraphView, type ProposalSummary } from "../model.ts";
import { PropertiesField, TextAreaField, TextField } from "./fields.tsx";

export type InspectorActions = {
  updateGraph: (patch: Partial<GraphInput>) => void;
  deleteGraph: () => void;
  publish: () => void;
  updateNode: (id: string, patch: Partial<Pick<GraphNode, "name" | "description" | "labels" | "properties">>) => void;
  removeNodeFromGraph: (id: string) => void;
  deleteNode: (id: string) => void;
  updateEdge: (id: string, patch: Partial<Pick<GraphEdge, "label" | "directed" | "source" | "target" | "properties">>) => void;
  removeEdgeFromGraph: (id: string) => void;
  deleteEdge: (id: string) => void;
  reviewProposal: (id: string) => void;
};

const nameOf = (view: GraphView, id: string) => view.nodes.find((node) => node.id === id)?.name ?? id;

const NodeInspector = ({ node, view, actions }: { node: GraphNode; view: GraphView; actions: InspectorActions }) => {
  const degree = view.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
  return (
    <section className="section">
      <h2>Node</h2>
      <TextField label="Name" value={node.name} onCommit={(name) => actions.updateNode(node.id, { name })} />
      <TextAreaField
        label="Description"
        placeholder="Optional"
        value={node.description}
        onCommit={(description) => actions.updateNode(node.id, { description })}
      />
      <TextField
        label="Labels"
        placeholder="Person, Service"
        value={node.labels.join(", ")}
        onCommit={(text) => actions.updateNode(node.id, { labels: normalizeLabels(text.split(",")) })}
      />
      <PropertiesField properties={node.properties} onCommit={(properties) => actions.updateNode(node.id, { properties })} />
      <p className="hint">{degree} edges in this graph.</p>
      <div className="row">
        <button type="button" onClick={() => actions.removeNodeFromGraph(node.id)}>
          Remove from graph
        </button>
        <button
          type="button"
          className="danger"
          onClick={() => {
            if (confirm(`Delete "${node.name}" and all its edges from every graph?`)) actions.deleteNode(node.id);
          }}
        >
          Delete everywhere
        </button>
      </div>
      <p className="mono">{node.id}</p>
    </section>
  );
};

const EdgeInspector = ({ edge, view, actions }: { edge: GraphEdge; view: GraphView; actions: InspectorActions }) => (
  <section className="section">
    <h2>Edge</h2>
    <p className="endpoints">
      {nameOf(view, edge.source)} {edge.directed ? "→" : "—"} {nameOf(view, edge.target)}
    </p>
    <TextField label="Label" placeholder="calls, owns, knows" value={edge.label} onCommit={(label) => actions.updateEdge(edge.id, { label })} />
    <label className="check">
      <input type="checkbox" checked={edge.directed} onChange={(e) => actions.updateEdge(edge.id, { directed: e.target.checked })} />
      Directed
    </label>
    {edge.directed && edge.source !== edge.target && (
      <button type="button" onClick={() => actions.updateEdge(edge.id, { source: edge.target, target: edge.source })}>
        Reverse direction
      </button>
    )}
    <PropertiesField properties={edge.properties} onCommit={(properties) => actions.updateEdge(edge.id, { properties })} />
    <div className="row">
      <button type="button" onClick={() => actions.removeEdgeFromGraph(edge.id)}>
        Remove from graph
      </button>
      <button
        type="button"
        className="danger"
        onClick={() => {
          if (confirm("Delete this edge from every graph?")) actions.deleteEdge(edge.id);
        }}
      >
        Delete everywhere
      </button>
    </div>
    <p className="mono">{edge.id}</p>
  </section>
);

const Versions = ({ versions, notice, actions }: { versions: GraphVersionSummary[]; notice: string | null; actions: InspectorActions }) => (
  <section className="section">
    <h2>Versions</h2>
    <p className="hint">Apps run a published version. A version does not change when you edit the graph.</p>
    <button type="button" onClick={actions.publish}>
      Publish
    </button>
    {notice != null && <p className="hint">{notice}</p>}
    {versions.length === 0 ? (
      <p className="hint">Not published.</p>
    ) : (
      <ul className="versions">
        {versions.map((version) => (
          <li key={version.version}>
            <span>Version {version.version}</span>
            <span className="meta">{new Date(version.publishedAt).toLocaleString()}</span>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const Proposals = ({ proposals, actions }: { proposals: ProposalSummary[]; actions: InspectorActions }) => (
  <section className="section">
    <h2>Proposals</h2>
    <p className="hint">A proposal is a changed copy of the graph, for example from Claude. Review it against a version before you apply it.</p>
    {proposals.length === 0 ? (
      <p className="hint">No proposals.</p>
    ) : (
      <ul className="list">
        {proposals.map((proposal) => (
          <li key={proposal.id}>
            <button type="button" onClick={() => actions.reviewProposal(proposal.id)}>
              <span>
                {proposal.title} <span className={`badge badge-status-${proposal.status}`}>{proposal.status}</span>
              </span>
              <span className="meta">
                {proposal.workItem !== "" && `${proposal.workItem} · `}
                {new Date(proposal.createdAt).toLocaleString()}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )}
  </section>
);

const GraphInspector = ({ view, actions }: { view: GraphView; actions: InspectorActions }) => (
  <section className="section">
    <h2>Graph</h2>
    <TextField label="Name" value={view.graph.name} onCommit={(name) => actions.updateGraph({ name })} />
    <TextAreaField
      label="Purpose"
      placeholder="What is this graph for?"
      value={view.graph.description}
      onCommit={(description) => actions.updateGraph({ description })}
    />
    <p className="hint">
      {view.nodes.length} nodes and {view.edges.length} edges. Drag from a dot on one node to a dot on another node to add an edge. Drag to a dot on the same node to add a loop. Select a node or an edge to edit it.
    </p>
    <button
      type="button"
      className="danger"
      onClick={() => {
        if (confirm(`Delete the graph "${view.graph.name}"? Its nodes and edges stay in the library.`)) actions.deleteGraph();
      }}
    >
      Delete graph
    </button>
    <p className="mono">{view.graph.id}</p>
  </section>
);

export const Inspector = ({
  view,
  versions,
  proposals,
  notice,
  selection,
  actions,
}: {
  view: GraphView;
  versions: GraphVersionSummary[];
  proposals: ProposalSummary[];
  notice: string | null;
  selection: { kind: "node" | "edge"; id: string } | null;
  actions: InspectorActions;
}) => {
  const node = selection?.kind === "node" ? view.nodes.find(({ id }) => id === selection.id) : undefined;
  const edge = selection?.kind === "edge" ? view.edges.find(({ id }) => id === selection.id) : undefined;
  if (node != null) return <NodeInspector key={node.id} node={node} view={view} actions={actions} />;
  if (edge != null) return <EdgeInspector key={edge.id} edge={edge} view={view} actions={actions} />;
  return (
    <>
      <GraphInspector key={view.graph.id} view={view} actions={actions} />
      <Proposals proposals={proposals} actions={actions} />
      <Versions versions={versions} notice={notice} actions={actions} />
    </>
  );
};
