import { useState, type FormEvent } from "react";
import type { Flow, FlowStep, GraphContent } from "../model.ts";
import { edgeText, type FlowPath } from "./canvas.tsx";
import { TextAreaField, TextField } from "./fields.tsx";
import { useVocabulary } from "./vocabulary.ts";

const isBroken = (content: GraphContent, { nodeId, edgeId }: FlowStep) =>
  !content.nodes.some(({ id }) => id === nodeId) || (edgeId != null && !content.edges.some(({ id }) => id === edgeId));

export const pathOf = (flow: Flow): FlowPath => {
  const steps = new Map<string, number[]>();
  flow.steps.forEach(({ nodeId }, index) => steps.set(nodeId, [...(steps.get(nodeId) ?? []), index + 1]));
  return { steps, edges: new Set(flow.steps.flatMap(({ edgeId }) => (edgeId == null ? [] : [edgeId]))) };
};

// The flows of the graph. The panel shows them when nothing is selected.
export const FlowsSection = ({
  flows,
  content,
  onOpen,
  onCreate,
}: {
  flows: Flow[];
  content: GraphContent;
  onOpen: (flowId: string) => void;
  onCreate?: (name: string) => void;
}) => {
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onCreate == null || name.trim() === "") return;
    onCreate(name.trim());
    setName("");
  };
  return (
    <section className="section">
      <h2>Flows</h2>
      <p className="hint">A flow is one path through the graph, step by step: the main path of a feature, or an edge case.</p>
      {flows.length === 0 ? (
        <p className="meta">No flows.</p>
      ) : (
        <ul className="versions">
          {flows.map((flow) => (
            <li key={flow.id}>
              <button type="button" className="link" onClick={() => onOpen(flow.id)}>
                {flow.name}
              </button>
              <span className={flow.steps.some((step) => isBroken(content, step)) ? "meta warning" : "meta"}>
                {flow.steps.length} steps
              </span>
            </li>
          ))}
        </ul>
      )}
      {onCreate != null && (
        <form className="flow-new" autoComplete="off" onSubmit={submit}>
          <input
            value={name}
            placeholder="Name of a new flow"
            aria-label="Name of a new flow"
            onChange={(e) => setName(e.target.value)}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
          />
          <button type="submit" disabled={name.trim() === ""}>
            Add
          </button>
        </form>
      )}
    </section>
  );
};

export type FlowActions = {
  update: (patch: { name?: string; description?: string }) => void;
  truncate: (length: number) => void;
  remove: () => void;
  close: () => void;
};

// One flow and its steps. In the draft, a click on a node or an edge of the canvas adds the next step.
export const FlowPanel = ({ flow, content, readOnly, actions }: { flow: Flow; content: GraphContent; readOnly: boolean; actions: FlowActions }) => {
  const vocabulary = useVocabulary();
  const nodeName = (id: string) => content.nodes.find((node) => node.id === id)?.name;
  const edgeOf = (id: string | null) => (id == null ? undefined : content.edges.find((edge) => edge.id === id));
  return (
    <section className="section">
      <h2>Flow</h2>
      {readOnly ? (
        <>
          <p className="endpoints">{flow.name}</p>
          {flow.description !== "" && <p className="hint">{flow.description}</p>}
        </>
      ) : (
        <>
          <TextField label="Name" value={flow.name} onCommit={(name) => actions.update({ name })} />
          <TextAreaField
            label="Description"
            placeholder="What happens on this path, and when"
            value={flow.description}
            onCommit={(description) => actions.update({ description })}
          />
          <p className="hint">
            {flow.steps.length === 0
              ? "Click a node on the canvas to start the flow there."
              : "Click a node or an edge on the canvas to add the next step. The step must follow an edge from the last node."}
          </p>
        </>
      )}
      {flow.steps.length > 0 && (
        <ol className="flow-steps">
          {flow.steps.map((step, index) => {
            const edge = edgeOf(step.edgeId);
            const via = edge == null ? "" : edgeText(edge, vocabulary);
            return (
              <li key={index}>
                <span className={isBroken(content, step) ? "broken" : ""}>
                  {nodeName(step.nodeId) ?? "Node not in the graph"}
                  {step.edgeId != null && edge == null ? " (edge not in the graph)" : via !== "" && <span className="meta"> via {via}</span>}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    className="link"
                    onClick={() => actions.truncate(index)}
                    aria-label={`Remove step ${index + 1} and the steps after it`}
                    title="Remove this step and the steps after it"
                  >
                    ×
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className="row">
        <button type="button" onClick={actions.close}>
          Done
        </button>
        {!readOnly && (
          <button
            type="button"
            className="danger"
            onClick={() => {
              if (confirm(`Delete the flow "${flow.name}"?`)) actions.remove();
            }}
          >
            Delete flow
          </button>
        )}
      </div>
      <p className="mono">{flow.id}</p>
    </section>
  );
};
