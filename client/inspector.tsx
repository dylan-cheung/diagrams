import { useEffect, useState } from "react";
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

const NO_FILL = { autoComplete: "off", "data-1p-ignore": true, "data-lpignore": "true", "data-bwignore": true, "data-form-type": "other" } as const;

const GraphInspector = ({ view, actions }: { view: GraphView; actions: InspectorActions }) => {
  const [name, setName] = useState(view.graph.name);
  const [purpose, setPurpose] = useState(view.graph.description);
  useEffect(() => setName(view.graph.name), [view.graph.name]);
  useEffect(() => setPurpose(view.graph.description), [view.graph.description]);
  return (
    <section className="section graph-head">
      <input
        className="title-input"
        aria-label="Graph name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() !== "" && name !== view.graph.name) actions.updateGraph({ name });
          else setName(view.graph.name);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") setName(view.graph.name);
        }}
        {...NO_FILL}
      />
      <textarea
        className="purpose-input"
        aria-label="Purpose"
        placeholder="What is this graph for?"
        value={purpose}
        onChange={(e) => setPurpose(e.target.value)}
        onBlur={() => {
          if (purpose !== view.graph.description) actions.updateGraph({ description: purpose });
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPurpose(view.graph.description);
        }}
        {...NO_FILL}
      />
      <p className="meta">
        {view.nodes.length} nodes · {view.edges.length} edges
      </p>
    </section>
  );
};

// The end of the panel for the graph: its id, for the API.
export const GraphFooter = ({ view }: { view: GraphView }) => (
  <footer className="panel-footer">
    <span className="mono">{view.graph.id}</span>
  </footer>
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
