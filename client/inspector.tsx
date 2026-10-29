import { normalizeLabels, type GraphEdge, type GraphNode, type GraphView } from "../model.ts";
import { PropertiesField, TextField } from "./fields.tsx";

export type InspectorActions = {
  renameGraph: (name: string) => void;
  deleteGraph: () => void;
  updateNode: (id: string, patch: Partial<Pick<GraphNode, "name" | "labels" | "properties">>) => void;
  removeNodeFromGraph: (id: string) => void;
  deleteNode: (id: string) => void;
  updateEdge: (id: string, patch: Partial<Pick<GraphEdge, "label" | "directed" | "source" | "target" | "properties">>) => void;
  removeEdgeFromGraph: (id: string) => void;
  deleteEdge: (id: string) => void;
};

const nameOf = (view: GraphView, id: string) => view.nodes.find((node) => node.id === id)?.name ?? id;

const NodeInspector = ({ node, view, actions }: { node: GraphNode; view: GraphView; actions: InspectorActions }) => {
  const degree = view.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
  return (
    <section className="section">
      <h2>Node</h2>
      <TextField label="Name" value={node.name} onCommit={(name) => actions.updateNode(node.id, { name })} />
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

const GraphInspector = ({ view, actions }: { view: GraphView; actions: InspectorActions }) => (
  <section className="section">
    <h2>Graph</h2>
    <TextField label="Name" value={view.graph.name} onCommit={actions.renameGraph} />
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
  selection,
  actions,
}: {
  view: GraphView;
  selection: { kind: "node" | "edge"; id: string } | null;
  actions: InspectorActions;
}) => {
  const node = selection?.kind === "node" ? view.nodes.find(({ id }) => id === selection.id) : undefined;
  const edge = selection?.kind === "edge" ? view.edges.find(({ id }) => id === selection.id) : undefined;
  if (node != null) return <NodeInspector key={node.id} node={node} view={view} actions={actions} />;
  if (edge != null) return <EdgeInspector key={edge.id} edge={edge} view={view} actions={actions} />;
  return <GraphInspector key={view.graph.id} view={view} actions={actions} />;
};
