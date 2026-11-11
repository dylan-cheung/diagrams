import { normalizeLabels, type GraphEdge, type GraphInput, type GraphNode, type GraphView } from "../model.ts";
import { PropertiesField, SelectField, TextAreaField, TextField } from "./fields.tsx";
import { useVocabulary } from "./vocabulary.ts";

type NodePatch = Partial<Pick<GraphNode, "name" | "description" | "type" | "intent" | "status" | "labels" | "properties">>;

type EdgePatch = Partial<
  Pick<GraphEdge, "type" | "label" | "description" | "intent" | "status" | "directed" | "source" | "target" | "properties">
>;

export type InspectorActions = {
  updateGraph: (patch: Partial<GraphInput>) => void;
  deleteGraph: () => void;
  updateNode: (id: string, patch: NodePatch) => void;
  removeNodeFromGraph: (id: string) => void;
  updateEdge: (id: string, patch: EdgePatch) => void;
  removeEdgeFromGraph: (id: string) => void;
};

const nameOf = (view: GraphView, id: string) => view.nodes.find((node) => node.id === id)?.name ?? id;

const NodeInspector = ({ node, view, actions }: { node: GraphNode; view: GraphView; actions: InspectorActions }) => {
  const vocabulary = useVocabulary();
  const degree = view.edges.filter((edge) => edge.source === node.id || edge.target === node.id).length;
  return (
    <section className="section">
      <h2>Node</h2>
      <TextField label="Name" value={node.name} onCommit={(name) => actions.updateNode(node.id, { name })} />
      <SelectField
        label="Type"
        empty="No type"
        value={node.type}
        options={vocabulary.nodeTypes}
        onCommit={(type) => actions.updateNode(node.id, { type })}
      />
      <SelectField
        label="Status"
        empty="No status"
        value={node.status}
        options={vocabulary.statuses}
        onCommit={(status) => actions.updateNode(node.id, { status })}
      />
      <TextAreaField
        label="Description"
        placeholder="Optional"
        value={node.description}
        onCommit={(description) => actions.updateNode(node.id, { description })}
      />
      <TextAreaField
        label="Intent"
        placeholder="Why does this exist?"
        value={node.intent}
        onCommit={(intent) => actions.updateNode(node.id, { intent })}
      />
      <TextField
        label="Labels"
        placeholder="Person, Service"
        value={node.labels.join(", ")}
        onCommit={(text) => actions.updateNode(node.id, { labels: normalizeLabels(text.split(",")) })}
      />
      <PropertiesField properties={node.properties} onCommit={(properties) => actions.updateNode(node.id, { properties })} />
      <p className="hint">{degree} edges in this graph.</p>
      <button type="button" className="danger" onClick={() => actions.removeNodeFromGraph(node.id)}>
        Delete node
      </button>
      <p className="mono">{node.id}</p>
    </section>
  );
};

const EdgeInspector = ({ edge, view, actions }: { edge: GraphEdge; view: GraphView; actions: InspectorActions }) => {
  const vocabulary = useVocabulary();
  return (
    <section className="section">
      <h2>Edge</h2>
      <p className="endpoints">
        {nameOf(view, edge.source)} {edge.directed ? "→" : "—"} {nameOf(view, edge.target)}
      </p>
      <SelectField
        label="Relationship"
        empty="No relationship type"
        value={edge.type}
        options={vocabulary.relationshipTypes}
        onCommit={(type) => actions.updateEdge(edge.id, { type })}
      />
      <SelectField
        label="Status"
        empty="No status"
        value={edge.status}
        options={vocabulary.statuses}
        onCommit={(status) => actions.updateEdge(edge.id, { status })}
      />
      <TextField
        label="Label"
        placeholder="Optional. Shown instead of the relationship type."
        value={edge.label}
        onCommit={(label) => actions.updateEdge(edge.id, { label })}
      />
      <TextAreaField
        label="Description"
        placeholder="Optional"
        value={edge.description}
        onCommit={(description) => actions.updateEdge(edge.id, { description })}
      />
      <TextAreaField
        label="Intent"
        placeholder="Why does this connection exist?"
        value={edge.intent}
        onCommit={(intent) => actions.updateEdge(edge.id, { intent })}
      />
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
      <button type="button" className="danger" onClick={() => actions.removeEdgeFromGraph(edge.id)}>
        Delete edge
      </button>
      <p className="mono">{edge.id}</p>
    </section>
  );
};

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
        if (confirm(`Delete the graph "${view.graph.name}"? Its nodes and edges are deleted too.`)) actions.deleteGraph();
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
