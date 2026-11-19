import { Panel, ReactFlowProvider } from "@xyflow/react";
import { useState, type FormEvent } from "react";
import { itemRef, PSEUDO_LAYERS, parseRef } from "../change-items.ts";
import type { Change, ChangeDiff, ChangeInput, GraphContent, GraphSummary, PseudoLayer } from "../model.ts";
import { GraphCanvas } from "./canvas.tsx";
import { InlineText, NO_FILL, TextAreaField } from "./fields.tsx";
import { Link } from "./router.tsx";

export const LAYER_NAMES: Record<PseudoLayer, string> = { ui: "UI", api: "API", store: "Store", data: "Data" };

// What every view needs: the class of an item (selected, linked or dimmed), a click on an item, and whether a click
// links instead of selects.
export type ItemProps = {
  itemClass: (ref: string) => string;
  onPick: (ref: string) => void;
  linking: boolean;
  linkCount: (ref: string) => number;
};

type Save = (patch: Partial<ChangeInput>) => void;

const Remove = ({ label, onClick }: { label: string; onClick: () => void }) => (
  <button type="button" className="link" onClick={onClick} aria-label={label} title={label}>
    ×
  </button>
);

const Links = ({ count }: { count: number }) => (count === 0 ? null : <span className="meta">{count === 1 ? "1 link" : `${count} links`}</span>);

// The idea view: the goal and notes in prose, then the bullet points. Each bullet point can have links.
export const IdeaView = ({ change, save, itemClass, onPick, linking, linkCount }: { change: Change; save: Save } & ItemProps) => {
  const [text, setText] = useState("");
  const add = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim() === "") return;
    save({ ideas: [...change.ideas, { text: text.trim() }] });
    setText("");
  };
  return (
    <div className="change-doc">
      <TextAreaField label="Goal and notes" placeholder="What the change is for, and anything to keep in mind" value={change.notes} onCommit={(notes) => save({ notes })} />
      <h2>Points</h2>
      <p className="hint">Each point is one part of the idea. Link it to the concepts that carry it out.</p>
      <ol className="change-items">
        {change.ideas.map((idea, index) => {
          const ref = itemRef("idea", idea.id);
          return (
            <li key={idea.id} className={`change-item idea-item${itemClass(ref)}`} onClick={linking ? () => onPick(ref) : undefined}>
              <button type="button" className="item-handle" onClick={linking ? undefined : () => onPick(ref)} aria-label={`Select point ${index + 1}`}>
                {index + 1}
              </button>
              {linking ? (
                <span className="item-text">{idea.text}</span>
              ) : (
                <InlineText
                  className="item-text"
                  label={`Point ${index + 1}`}
                  value={idea.text}
                  required
                  onFocus={() => onPick(ref)}
                  onCommit={(next) => save({ ideas: change.ideas.map((item) => (item.id === idea.id ? { ...item, text: next } : item)) })}
                />
              )}
              <Links count={linkCount(ref)} />
              {!linking && <Remove label={`Remove point ${index + 1} and its links`} onClick={() => save({ ideas: change.ideas.filter(({ id }) => id !== idea.id) })} />}
            </li>
          );
        })}
      </ol>
      {!linking && (
        <form className="flow-new" autoComplete="off" onSubmit={add}>
          <input value={text} placeholder="A new point" aria-label="New point" onChange={(e) => setText(e.target.value)} {...NO_FILL} />
          <button type="submit" disabled={text.trim() === ""}>
            Add
          </button>
        </form>
      )}
    </div>
  );
};

// The concept view: the graph of the change. It is read-only here; the graph page edits it.
export const ConceptView = ({
  change,
  graph,
  graphs,
  focus,
  selected,
  onPick,
  onClear,
  onSetGraph,
  onMakeGraph,
}: {
  change: Change;
  graph: GraphContent | null;
  graphs: GraphSummary[];
  focus: Set<string> | undefined;
  selected: string | null;
  onPick: (ref: string) => void;
  onClear: () => void;
  onSetGraph: (graphId: string) => void;
  onMakeGraph: () => void;
}) => {
  if (change.graphId == null)
    return (
      <div className="change-doc">
        <p className="hint">The concept view is a graph: the smaller concepts of the change, and how they relate. Pick a graph or make one.</p>
        <div className="row">
          <select value="" aria-label="Graph of the concept view" onChange={(e) => e.target.value !== "" && onSetGraph(e.target.value)}>
            <option value="">Pick a graph</option>
            {graphs.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={onMakeGraph}>
            Make a graph
          </button>
        </div>
      </div>
    );
  if (graph == null) return <p className="empty">Loading the graph…</p>;
  const node = parseRef(selected ?? "");
  const graphId = change.graphId;
  return (
    <ReactFlowProvider>
      <GraphCanvas
        view={graph}
        readOnly
        selection={node?.kind === "node" ? { kind: "node", id: node.id } : null}
        focus={focus}
        onSelect={(next) => {
          if (next == null) onClear();
          else if (next.kind === "node") onPick(itemRef("node", next.id));
        }}
      >
        <Panel position="top-center" className="floating-note">
          {graph.nodes.length === 0 && <span className="meta">The graph has no nodes. </span>}
          <Link className="link" to={{ page: "graph", graphId }}>
            Edit the graph
          </Link>
        </Panel>
      </GraphCanvas>
    </ReactFlowProvider>
  );
};

// The pseudocode view: one lane for each layer, with its blocks in order.
export const PseudoView = ({ change, save, itemClass, onPick, linking, linkCount }: { change: Change; save: Save } & ItemProps) => {
  const setBlock = (id: string, patch: { layer?: PseudoLayer; text?: string }) =>
    save({ blocks: change.blocks.map((block) => (block.id === id ? { ...block, ...patch } : block)) });
  return (
    <div className="pseudo-lanes">
      {PSEUDO_LAYERS.map((layer) => (
        <section key={layer} className="pseudo-lane">
          <h2>{LAYER_NAMES[layer]}</h2>
          {change.blocks
            .filter((block) => block.layer === layer)
            .map((block) => {
              const ref = itemRef("pseudo", block.id);
              return (
                <div key={block.id} className={`change-item pseudo-block${itemClass(ref)}`} onClick={linking ? () => onPick(ref) : undefined}>
                  <div className="item-head">
                    <button type="button" className="item-handle" onClick={linking ? undefined : () => onPick(ref)} aria-label="Select this block">
                      ⋮
                    </button>
                    <Links count={linkCount(ref)} />
                    <span className="spacer" />
                    {!linking && (
                      <>
                        <select value={block.layer} aria-label="Layer of the block" onChange={(e) => setBlock(block.id, { layer: e.target.value as PseudoLayer })}>
                          {PSEUDO_LAYERS.map((item) => (
                            <option key={item} value={item}>
                              {LAYER_NAMES[item]}
                            </option>
                          ))}
                        </select>
                        <Remove label="Remove this block and its links" onClick={() => save({ blocks: change.blocks.filter(({ id }) => id !== block.id) })} />
                      </>
                    )}
                  </div>
                  {linking ? (
                    <pre className="item-code">{block.text === "" ? " " : block.text}</pre>
                  ) : (
                    <InlineText
                      className="item-code"
                      label="Pseudocode"
                      placeholder="on click: …"
                      multiline
                      value={block.text}
                      onFocus={() => onPick(ref)}
                      onCommit={(text) => setBlock(block.id, { text })}
                    />
                  )}
                </div>
              );
            })}
          {!linking && (
            <button type="button" className="link add-block" onClick={() => save({ blocks: [...change.blocks, { layer, text: "" }] })}>
              + Block
            </button>
          )}
        </section>
      ))}
    </div>
  );
};

const lineClass = (line: string) => (line.startsWith("+") ? "line-added" : line.startsWith("-") ? "line-removed" : "");

// The code view: the diff of the branch, file by file. Each hunk can have links.
export const CodeView = ({
  change,
  diff,
  error,
  onReload,
  itemClass,
  onPick,
  linkCount,
}: { change: Change; diff: ChangeDiff | null; error: string | null; onReload: () => void } & ItemProps) => {
  if (change.branch === "") return <p className="empty">Set the repository and the branch of the change in the panel to see its code.</p>;
  if (error != null)
    return (
      <div className="change-doc">
        <p className="warning">{error}</p>
        <button type="button" onClick={onReload}>
          Try again
        </button>
      </div>
    );
  if (diff == null) return <p className="empty">Loading the diff…</p>;
  return (
    <div className="change-doc">
      <div className="row">
        <span className="meta">
          {diff.base}...{diff.branch} · {diff.files.length === 1 ? "1 file" : `${diff.files.length} files`}
        </span>
        <button type="button" className="link" onClick={onReload}>
          Reload
        </button>
      </div>
      {diff.files.length === 0 && <p className="hint">The branch has no changes since it left {diff.base}.</p>}
      {diff.files.map((file) => (
        <section key={file.path} className="diff-file">
          <h2 className="mono">{file.path}</h2>
          {file.hunks.map((hunk) => {
            const ref = itemRef("hunk", hunk.id);
            return (
              <div key={hunk.id} className={`change-item diff-hunk${itemClass(ref)}`} onClick={() => onPick(ref)}>
                <div className="item-head">
                  <span className="mono">{hunk.header}</span>
                  <span className="spacer" />
                  <Links count={linkCount(ref)} />
                </div>
                <pre className="item-code">
                  {hunk.lines.map((line, index) => (
                    <span key={index} className={lineClass(line)}>
                      {line}
                      {"\n"}
                    </span>
                  ))}
                </pre>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
};
