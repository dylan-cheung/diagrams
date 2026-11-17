import { useState, type FormEvent } from "react";
import type { Flow, FlowStep, GraphContent, Run } from "../model.ts";
import { edgeText, type FlowPath } from "./canvas.tsx";
import { TextAreaField, TextField } from "./fields.tsx";
import { localTime } from "./graph-list.tsx";
import { PanelSection } from "./view-panel.tsx";
import { useVocabulary } from "./vocabulary.ts";

const isBroken = (content: GraphContent, { nodeId, edgeId }: FlowStep) =>
  !content.nodes.some(({ id }) => id === nodeId) || (edgeId != null && !content.edges.some(({ id }) => id === edgeId));

// The path of a flow. With `reached`, the number of steps a run reached, it also marks the current step and the steps after it.
export const pathOf = (flow: Flow, reached?: number): FlowPath => {
  const steps = new Map<string, number[]>();
  flow.steps.forEach(({ nodeId }, index) => steps.set(nodeId, [...(steps.get(nodeId) ?? []), index + 1]));
  const edges = new Set(flow.steps.flatMap(({ edgeId }) => (edgeId == null ? [] : [edgeId])));
  if (reached == null) return { steps, edges };
  const done = flow.steps.slice(0, reached);
  const pending = new Set(
    flow.steps.slice(reached).flatMap(({ nodeId, edgeId }) => [
      ...(done.some((step) => step.nodeId === nodeId) ? [] : [nodeId]),
      ...(edgeId == null || done.some((step) => step.edgeId === edgeId) ? [] : [edgeId]),
    ]),
  );
  return { steps, edges, current: flow.steps[reached - 1]?.nodeId, pending };
};

const runName = (run: Run) => (run.label !== "" ? run.label : `Run of ${localTime(run.startedAt)}`);

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
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (onCreate == null || name.trim() === "") return;
    onCreate(name.trim());
    setName("");
    setAdding(false);
  };
  return (
    <PanelSection
      id="flows"
      title="Flows"
      count={flows.length}
      about="A flow is one path through the graph, step by step: the main path of a feature, or an edge case."
      action={
        onCreate != null && (
          <button type="button" className="panel-action" onClick={() => setAdding(!adding)} aria-label="New flow" title="New flow">
            +
          </button>
        )
      }
    >
      {adding && (
        <form className="flow-new" autoComplete="off" onSubmit={submit}>
          <input
            value={name}
            placeholder="Name of the new flow"
            aria-label="Name of the new flow"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") setAdding(false);
            }}
            autoFocus
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
      {flows.length === 0 ? (
        !adding && <p className="meta">No flows. {onCreate != null && "Click + to trace a path through the graph."}</p>
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
    </PanelSection>
  );
};

export type FlowActions = {
  update: (patch: { name?: string; description?: string }) => void;
  truncate: (length: number) => void;
  remove: () => void;
  close: () => void;
  startRun: () => void;
  openRun: (run: Run) => void;
};

// One flow and its steps. In the draft, a click on a node or an edge of the canvas adds the next step.
export const FlowPanel = ({
  flow,
  content,
  readOnly,
  runs,
  canRun,
  actions,
}: {
  flow: Flow;
  content: GraphContent;
  readOnly: boolean;
  runs: Run[];
  canRun: string | null;
  actions: FlowActions;
}) => {
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
      <h2>Runs</h2>
      <p className="hint">A run is one pass through this flow on a published version, for example one call or one claim.</p>
      {runs.length === 0 ? (
        <p className="meta">No runs.</p>
      ) : (
        <ul className="versions">
          {runs.map((run) => (
            <li key={run.id}>
              <button type="button" className="link" onClick={() => actions.openRun(run)}>
                {runName(run)}
              </button>
              <span className="meta">
                v{run.version} · {run.events.length}/{flow.steps.length} <span className={`pill ${run.status}`}>{run.status}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
      <button type="button" onClick={actions.startRun} disabled={canRun != null} title={canRun ?? "Start a run of this flow on the latest version"}>
        Start a run
      </button>
      {canRun != null && <p className="meta">{canRun}</p>}
    </section>
  );
};

export type RunActions = {
  advance: (note: string) => void;
  finish: (status: "completed" | "failed" | "cancelled") => void;
  close: () => void;
};

// One run of a flow: the steps it reached, and the controls to move it on or finish it.
export const RunPanel = ({ run, flow, content, actions }: { run: Run; flow: Flow; content: GraphContent; actions: RunActions }) => {
  const [note, setNote] = useState("");
  const nodeName = (id: string) => content.nodes.find((node) => node.id === id)?.name ?? "Node not in the version";
  const atLast = run.events.length >= flow.steps.length;
  return (
    <section className="section">
      <h2>Run</h2>
      <p className="endpoints">
        {runName(run)} <span className={`pill ${run.status}`}>{run.status}</span>
      </p>
      <p className="hint">
        Flow "{flow.name}" on version {run.version}. Step {run.events.length} of {flow.steps.length}.
      </p>
      <ol className="flow-steps run-events">
        {run.events.map((event) => (
          <li key={event.step}>
            <span>
              {nodeName(event.nodeId)}
              {event.note !== "" && <span className="meta"> · {event.note}</span>}
            </span>
            <span className="meta">{localTime(event.at)}</span>
          </li>
        ))}
      </ol>
      {run.note !== "" && <p className="hint">{run.note}</p>}
      {run.status === "running" && (
        <form
          className="run-controls"
          autoComplete="off"
          onSubmit={(event) => {
            event.preventDefault();
            if (atLast) return;
            actions.advance(note);
            setNote("");
          }}
        >
          {!atLast && (
            <input
              value={note}
              placeholder="Note for the next step (optional)"
              aria-label="Note for the next step"
              onChange={(e) => setNote(e.target.value)}
              autoComplete="off"
              data-1p-ignore
              data-lpignore="true"
              data-bwignore
              data-form-type="other"
            />
          )}
          <div className="row">
            {!atLast && (
              <button type="submit" className="primary">
                Next step: {nodeName(flow.steps[run.events.length]?.nodeId ?? "")}
              </button>
            )}
            <button type="button" className={atLast ? "primary" : undefined} onClick={() => actions.finish("completed")}>
              Complete
            </button>
            <button type="button" className="danger" onClick={() => actions.finish("failed")}>
              Fail
            </button>
            <button type="button" onClick={() => actions.finish("cancelled")}>
              Cancel run
            </button>
          </div>
        </form>
      )}
      <div className="row">
        <button type="button" onClick={actions.close}>
          Back to the flow
        </button>
      </div>
      <p className="mono">{run.id}</p>
    </section>
  );
};
