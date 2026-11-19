import { useCallback, useEffect, useMemo, useState } from "react";
import { CHANGE_VIEWS, levelOf, linkBetween, parseRef, tracedFrom, viewOfKind, type ChangeView } from "../change-items.ts";
import { toContent } from "../diff.ts";
import { autoLayout } from "../layout.ts";
import type { Change, ChangeDiff, ChangeInput, GraphContent, GraphSummary } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { edgeText } from "./canvas.tsx";
import { CodeView, ConceptView, IdeaView, LAYER_NAMES, PseudoView, type ItemProps } from "./change-views.tsx";
import { TextField } from "./fields.tsx";
import { go, Link } from "./router.tsx";
import { useVocabulary } from "./vocabulary.ts";

const errorsOf = (error: unknown) => (error instanceof ApiError ? error.errors : [(error as Error).message]);

type Item = { ref: string; view: ChangeView; text: string; broken: boolean };

// One change in four views. A selected item stays selected when you switch views, and each view shows the items that
// trace to it. In link mode, a click on an item in the next view up or down links it to the selected item or unlinks it.
export const ChangePage = ({ changeId, view }: { changeId: string; view: ChangeView }) => {
  const [change, setChange] = useState<Change | null>(null);
  const [graph, setGraph] = useState<GraphContent | null>(null);
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  const [diff, setDiff] = useState<ChangeDiff | null>(null);
  const [diffError, setDiffError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [linking, setLinking] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [missing, setMissing] = useState(false);
  const vocabulary = useVocabulary();

  useEffect(() => {
    api
      .getChange(changeId)
      .then(setChange)
      .catch((error: unknown) => {
        setMissing(true);
        setErrors(errorsOf(error));
      });
    void api.listGraphs().then(setGraphs);
  }, [changeId]);

  const graphId = change?.graphId ?? null;
  useEffect(() => {
    if (graphId == null) {
      setGraph(null);
      return;
    }
    // Nodes without a position get one for this page only. The graph page saves the layout.
    api
      .view(graphId)
      .then(async (view) => {
        const content = toContent(view);
        if (!content.nodes.some(({ position }) => position == null)) return content;
        const { positions } = await autoLayout(content.nodes, content.edges, true, view.graph.direction, (edge) => edgeText(edge, vocabulary));
        return { ...content, nodes: content.nodes.map((node) => ({ ...node, position: positions[node.id] ?? node.position })) };
      })
      .then(setGraph)
      .catch((error: unknown) => setErrors(errorsOf(error)));
  }, [graphId, vocabulary]);

  const repo = change?.repo;
  const base = change?.base;
  const branch = change?.branch;
  const loadDiff = useCallback(() => {
    if (branch == null || branch === "") return;
    setDiffError(null);
    api
      .diffChange(changeId)
      .then(setDiff)
      .catch((error: unknown) => setDiffError(errorsOf(error).join(" ")));
  }, [changeId, repo, base, branch]);
  useEffect(loadDiff, [loadDiff]);

  const save = (patch: Partial<ChangeInput>) =>
    void api
      .updateChange(changeId, patch)
      .then((next) => {
        setChange(next);
        setErrors([]);
      })
      .catch((error: unknown) => setErrors(errorsOf(error)));

  const links = useMemo(() => change?.links ?? [], [change]);
  const focus = useMemo(() => (selected == null ? null : tracedFrom(selected, links)), [selected, links]);
  const nodeFocus = useMemo(
    () => (focus == null ? undefined : new Set([...focus].flatMap((ref) => (parseRef(ref)?.kind === "node" ? [parseRef(ref)?.id ?? ""] : [])))),
    [focus],
  );
  const hunks = useMemo(() => new Map((diff?.files ?? []).flatMap((file) => file.hunks.map((hunk) => [hunk.id, { file, hunk }] as const))), [diff]);

  if (missing || change == null)
    return (
      <div className="app">
        <header className="toolbar">
          <Link className="back" to={{ page: "changes" }} aria-label="Back to changes" title="Back to changes">
            ←
          </Link>
        </header>
        <p className="empty">{missing ? errors.join(" ") : "Loading the change…"}</p>
      </div>
    );

  // The view, the text and whether the item is missing. A node or a hunk can leave the graph or the diff after a link
  // was made.
  const itemOf = (ref: string): Item => {
    const parsed = parseRef(ref);
    const id = parsed?.id ?? "";
    const kind = parsed?.kind ?? "idea";
    const item = (text: string | undefined, known: boolean) => ({ ref, view: viewOfKind(kind), text: text ?? ref, broken: known && text == null });
    if (kind === "idea") return item(change.ideas.find((idea) => idea.id === id)?.text, true);
    if (kind === "pseudo") {
      const block = change.blocks.find((candidate) => candidate.id === id);
      const first = block?.text.split("\n")[0] ?? "";
      return item(block == null ? undefined : `${LAYER_NAMES[block.layer]}: ${first === "" ? "(empty block)" : first}`, true);
    }
    if (kind === "node") return item(graph?.nodes.find((node) => node.id === id)?.name, graph != null);
    const found = hunks.get(id);
    return item(found == null ? undefined : `${found.file.path} ${found.hunk.header}`, diff != null);
  };

  const toggleLink = (a: string, b: string) => {
    const link = linkBetween(a, b);
    if (typeof link === "string") {
      setErrors([`${link} Pick an item in ${neighbors(a).map((level) => CHANGE_VIEWS[level]?.name).join(" or ")}.`]);
      return;
    }
    const has = links.some(({ from, to }) => from === link.from && to === link.to);
    save({ links: has ? links.filter(({ from, to }) => from !== link.from || to !== link.to) : [...links, link] });
  };

  const neighbors = (ref: string) => {
    const level = levelOf(parseRef(ref)?.kind ?? "idea");
    return [level - 1, level + 1].filter((next) => next >= 0 && next < CHANGE_VIEWS.length);
  };

  const pick = (ref: string) => {
    if (linking && selected != null && ref !== selected) toggleLink(selected, ref);
    else setSelected(ref);
  };

  const clear = () => {
    setSelected(null);
    setLinking(false);
  };

  const linksOf = (ref: string) => links.flatMap(({ from, to }) => (from === ref ? [to] : to === ref ? [from] : []));

  const itemProps: ItemProps = {
    itemClass: (ref) => (ref === selected ? " selected" : focus == null ? "" : focus.has(ref) ? " linked" : " dimmed"),
    onPick: pick,
    linking,
    linkCount: (ref) => linksOf(ref).length,
  };

  const counts: Record<ChangeView, number> = {
    idea: change.ideas.length,
    concepts: graph?.nodes.length ?? 0,
    pseudocode: change.blocks.length,
    code: hunks.size,
  };
  const linkedIn = (target: ChangeView) => [...(focus ?? [])].filter((ref) => ref !== selected && itemOf(ref).view === target).length;

  const selectedItem = selected == null ? null : itemOf(selected);

  const makeGraph = () =>
    void api
      .createGraph({ name: change.name, description: `The concepts of the change "${change.name}".` })
      .then((created) => save({ graphId: created.id }))
      .catch((error: unknown) => setErrors(errorsOf(error)));

  const showItem = (ref: string) => {
    setSelected(ref);
    go({ page: "change", changeId, view: itemOf(ref).view });
  };

  return (
    <div className={`app${linking ? " linking" : ""}`}>
      <header className="toolbar">
        <Link className="back" to={{ page: "changes" }} aria-label="Back to changes" title="Back to changes">
          ←
        </Link>
        <h1>{change.name}</h1>
        <nav className="view-tabs" aria-label="Views of the change">
          {CHANGE_VIEWS.map((item) => {
            const linked = linkedIn(item.view);
            return (
              <Link key={item.view} to={{ page: "change", changeId, view: item.view }} aria-current={item.view === view ? "page" : undefined} data-label={item.name}>
                {item.name}
                <span className="meta"> {focus != null ? (linked === 0 ? "" : `${linked} linked`) : counts[item.view]}</span>
              </Link>
            );
          })}
        </nav>
      </header>
      {errors.length > 0 && <div className="banner errors">{errors.join(" ")}</div>}
      {linking && selectedItem != null && (
        <div className="banner link-banner">
          Linking "{selectedItem.text}". Click items in {neighbors(selectedItem.ref).map((level) => CHANGE_VIEWS[level]?.name).join(" or ")} to link or unlink them.{" "}
          <button type="button" className="link" onClick={() => setLinking(false)}>
            Done
          </button>
        </div>
      )}
      <div className="body">
        <main className={view === "concepts" ? "canvas" : "change-main"} onClick={(event) => event.target === event.currentTarget && !linking && setSelected(null)}>
          {view === "idea" && <IdeaView change={change} save={save} {...itemProps} />}
          {view === "concepts" && (
            <ConceptView
              change={change}
              graph={graph}
              graphs={graphs}
              focus={nodeFocus}
              selected={selected}
              onPick={pick}
              onClear={() => !linking && setSelected(null)}
              onSetGraph={(next) => save({ graphId: next })}
              onMakeGraph={makeGraph}
            />
          )}
          {view === "pseudocode" && <PseudoView change={change} save={save} {...itemProps} />}
          {view === "code" && <CodeView change={change} diff={diff} error={diffError} onReload={loadDiff} {...itemProps} />}
        </main>
        <aside className="inspector">
          {selectedItem != null ? (
            <section className="section">
              <h2>{CHANGE_VIEWS.find((item) => item.view === selectedItem.view)?.name} item</h2>
              <p className={selectedItem.broken ? "endpoints broken" : "endpoints"}>{selectedItem.text}</p>
              {selectedItem.broken && <p className="meta warning">This item is not in the {selectedItem.view === "concepts" ? "graph" : "diff"} any more.</p>}
              {neighbors(selectedItem.ref).map((level) => {
                const target = CHANGE_VIEWS[level];
                if (target == null) return null;
                const linked = linksOf(selectedItem.ref)
                  .map(itemOf)
                  .filter((item) => item.view === target.view);
                return (
                  <div key={target.view} className="link-group">
                    <h3>
                      {level < levelOf(parseRef(selectedItem.ref)?.kind ?? "idea") ? "Carries out" : "Carried out by"} · {target.name}
                    </h3>
                    {linked.length === 0 ? (
                      <p className="meta">No links.</p>
                    ) : (
                      <ul className="versions">
                        {linked.map((item) => (
                          <li key={item.ref}>
                            <button type="button" className={item.broken ? "link broken" : "link"} onClick={() => showItem(item.ref)} title={item.broken ? "Not there any more" : "Show this item"}>
                              {item.text}
                            </button>
                            <button type="button" className="link" onClick={() => toggleLink(selectedItem.ref, item.ref)} aria-label="Remove this link" title="Remove this link">
                              ×
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setLinking(true);
                        go({ page: "change", changeId, view: target.view });
                      }}
                    >
                      Link items in {target.name}
                    </button>
                  </div>
                );
              })}
              <div className="row">
                <button type="button" onClick={clear}>
                  Done
                </button>
              </div>
            </section>
          ) : (
            <section className="section">
              <h2>Change</h2>
              <p className="hint">Select an item in any view. When you switch views, the items that trace to it stay marked.</p>
              <TextField label="Name" value={change.name} onCommit={(name) => save({ name })} />
              <label className="field">
                <span>Concept graph</span>
                <select value={change.graphId ?? ""} onChange={(e) => save({ graphId: e.target.value === "" ? null : e.target.value })}>
                  <option value="">None</option>
                  {graphs.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <TextField label="Repository" placeholder="/Users/me/Projects/app" value={change.repo} onCommit={(next) => save({ repo: next })} />
              <TextField label="Base branch" placeholder="main" value={change.base} onCommit={(next) => save({ base: next })} />
              <TextField label="Branch" placeholder="The branch of the change" value={change.branch} onCommit={(next) => save({ branch: next })} />
              <div className="row">
                <button
                  type="button"
                  className="danger"
                  onClick={() => {
                    if (confirm(`Delete the change "${change.name}"? Its graph and branch stay.`))
                      void api
                        .deleteChange(changeId)
                        .then(() => go({ page: "changes" }))
                        .catch((error: unknown) => setErrors(errorsOf(error)));
                  }}
                >
                  Delete change
                </button>
              </div>
              <p className="mono">{change.id}</p>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
};
