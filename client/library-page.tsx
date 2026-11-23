import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { GraphSummary, Library, NodeTypeTerm, Term } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { AppNav } from "./app-nav.tsx";
import { NO_FILL } from "./fields.tsx";
import { go, Link } from "./router.tsx";
import { useLibraries } from "./vocabulary.ts";

const errorsOf = (error: unknown) => (error instanceof ApiError ? error.errors : [(error as Error).message]);

const useGraphs = () => {
  const [graphs, setGraphs] = useState<GraphSummary[]>([]);
  useEffect(() => {
    void api.listGraphs().then(setGraphs);
  }, []);
  return graphs;
};

const NewLibraryDialog = ({ onClose }: { onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const { reload } = useLibraries();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => dialog.current?.showModal(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const library = await api.createLibrary({ name, description });
      await reload();
      go({ page: "library", libraryId: library.id });
    } catch (error) {
      setErrors(errorsOf(error));
    }
  };

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <form className="section" autoComplete="off" onSubmit={(event) => void submit(event)}>
        <h2>New library</h2>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus {...NO_FILL} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea rows={3} placeholder="What can a graph show with this library?" value={description} onChange={(e) => setDescription(e.target.value)} {...NO_FILL} />
        </label>
        <p className="hint">Add its node types and relationship types on the next page.</p>
        {errors.length > 0 && <p className="warning">{errors.join(" ")}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={name.trim() === ""}>
            Create
          </button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
};

const usedBy = (graphs: GraphSummary[], libraryId: string) => graphs.filter(({ libraryIds }) => libraryIds.includes(libraryId));

// Every library. A graph turns libraries on, and its nodes and edges can use only their types.
export const LibraryList = () => {
  const { libraries } = useLibraries();
  const graphs = useGraphs();
  const [creating, setCreating] = useState(false);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Diagram</h1>
        <AppNav current="libraries" />
        <span className="spacer" />
        <button type="button" className="primary add" aria-label="New library" title="New library" onClick={() => setCreating(true)}>
          +
        </button>
      </header>
      <div className="table-wrap">
        <table className="graph-table">
          <thead>
            <tr>
              <th>Library</th>
              <th className="numeric">Node types</th>
              <th className="numeric">Relationship types</th>
              <th className="numeric">Graphs</th>
            </tr>
          </thead>
          <tbody>
            {libraries.map((library) => (
              <tr key={library.id} onClick={() => go({ page: "library", libraryId: library.id })}>
                <td>
                  <div className="row-title">
                    <Link className="row-name" to={{ page: "library", libraryId: library.id }} onClick={(e) => e.stopPropagation()}>
                      {library.name}
                    </Link>
                    {library.builtIn && <span className="pill walkthrough">always on</span>}
                  </div>
                  <div className="row-purpose" title={library.description}>
                    {library.description}
                  </div>
                </td>
                <td className="numeric">{library.builtIn ? <span className="meta">node without a type</span> : library.nodeTypes.length}</td>
                <td className="numeric">{library.builtIn ? <span className="meta">edge without a type</span> : library.relationshipTypes.length}</td>
                <td className="numeric">{library.builtIn ? graphs.length : usedBy(graphs, library.id).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && <NewLibraryDialog onClose={() => setCreating(false)} />}
    </div>
  );
};

type Draft = Pick<Library, "name" | "description" | "nodeTypes" | "relationshipTypes">;

const draftOf = ({ name, description, nodeTypes, relationshipTypes }: Library): Draft => ({ name, description, nodeTypes, relationshipTypes });

const TermInputs = ({ term, onChange }: { term: Term; onChange: (term: Term) => void }) => (
  <>
    <td>
      <input className="mono-input" aria-label="Id" value={term.id} onChange={(e) => onChange({ ...term, id: e.target.value })} {...NO_FILL} />
    </td>
    <td>
      <input aria-label="Name" value={term.name} onChange={(e) => onChange({ ...term, name: e.target.value })} {...NO_FILL} />
    </td>
    <td>
      <textarea aria-label="Description" rows={2} value={term.description} onChange={(e) => onChange({ ...term, description: e.target.value })} {...NO_FILL} />
    </td>
  </>
);

const RemoveButton = ({ name, onRemove }: { name: string; onRemove: () => void }) => (
  <td className="actions">
    <button type="button" className="icon" aria-label={`Remove ${name}`} title={`Remove ${name}`} onClick={onRemove}>
      ×
    </button>
  </td>
);

// The tier of a node type: first tier, or within some of the first-tier types of the library.
const WithinField = ({ term, firstTier, onChange }: { term: NodeTypeTerm; firstTier: NodeTypeTerm[]; onChange: (within: string[]) => void }) => {
  const others = firstTier.filter(({ id }) => id !== term.id);
  const second = term.within.length > 0;
  return (
    <div className="within">
      <select
        aria-label="Tier"
        value={second ? "second" : "first"}
        onChange={(e) => onChange(e.target.value === "second" ? others.map(({ id }) => id).slice(0, 1) : [])}
        disabled={!second && others.length === 0}
      >
        <option value="first">First tier</option>
        <option value="second">Second tier, within…</option>
      </select>
      {second && (
        <div className="within-options">
          {others.map(({ id, name }) => (
            <label key={id} className="check">
              <input
                type="checkbox"
                checked={term.within.includes(id)}
                onChange={(e) => {
                  const next = e.target.checked ? [...term.within, id] : term.within.filter((item) => item !== id);
                  if (next.length > 0) onChange(next);
                }}
              />
              {name}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const NEW_NODE_TYPE: NodeTypeTerm = { id: "", name: "", description: "", within: [] };
const NEW_RELATIONSHIP_TYPE: Term = { id: "", name: "", description: "" };

// One library: its name, its description, and its node and relationship types. Edits stay in the page until Save.
export const LibraryPage = ({ libraryId }: { libraryId: string }) => {
  const { libraries, reload } = useLibraries();
  const library = libraries.find(({ id }) => id === libraryId);
  const graphs = useGraphs();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (library != null && draft == null) setDraft(draftOf(library));
  }, [library, draft]);

  const changed = useMemo(() => library != null && draft != null && JSON.stringify(draftOf(library)) !== JSON.stringify(draft), [library, draft]);
  const firstTier = (draft?.nodeTypes ?? []).filter(({ within }) => within.length === 0);
  const users = library?.builtIn === true ? graphs : usedBy(graphs, libraryId);

  const save = async () => {
    if (draft == null) return;
    try {
      const saved = await api.updateLibrary(libraryId, draft);
      await reload();
      setDraft(draftOf(saved));
      setErrors([]);
      setNotice("Saved.");
    } catch (error) {
      setErrors(errorsOf(error));
      setNotice(null);
    }
  };

  const remove = async () => {
    if (library == null || !confirm(`Delete the library "${library.name}"? Graphs stop using it. Nodes and edges keep their types.`)) return;
    try {
      await api.deleteLibrary(libraryId);
      await reload();
      go({ page: "libraries" });
    } catch (error) {
      setErrors(errorsOf(error));
    }
  };

  const edit = (patch: Partial<Draft>) => {
    setNotice(null);
    setDraft((current) => (current == null ? current : { ...current, ...patch }));
  };

  const setNodeType = (index: number, term: NodeTypeTerm) => {
    if (draft == null) return;
    const before = draft.nodeTypes[index];
    // A new id for a first-tier type also changes it in the within lists of the second-tier types.
    const renamed = (id: string) => (before != null && id === before.id ? term.id : id);
    edit({ nodeTypes: draft.nodeTypes.map((item, i) => (i === index ? term : { ...item, within: item.within.map(renamed) })) });
  };

  const removeNodeType = (index: number) => {
    if (draft == null) return;
    const gone = draft.nodeTypes[index]?.id;
    edit({
      nodeTypes: draft.nodeTypes
        .filter((_, i) => i !== index)
        .map((item) => ({ ...item, within: item.within.filter((id) => id !== gone) })),
    });
  };

  return (
    <div className="app">
      <header className="toolbar">
        <Link className="back" to={{ page: "libraries" }} aria-label="Back to libraries" title="Back to libraries">
          ←
        </Link>
        <h1>{library?.name ?? ""}</h1>
        <AppNav current="libraries" />
        <span className="spacer" />
        {library != null && !library.builtIn && (
          <>
            {notice != null && <span className="meta">{notice}</span>}
            {changed && (
              <button type="button" onClick={() => setDraft(draftOf(library))}>
                Discard changes
              </button>
            )}
            <button type="button" className="primary" disabled={!changed} onClick={() => void save()}>
              Save
            </button>
          </>
        )}
      </header>
      {errors.length > 0 && (
        <div className="banner errors">
          {errors.map((error) => (
            <div key={error}>{error}</div>
          ))}
        </div>
      )}
      {library == null || draft == null ? (
        <p className="empty">{libraries.length === 0 ? "Loading…" : `The library ${libraryId} does not exist.`}</p>
      ) : (
        <div className="table-wrap">
          <div className="library-page">
            {library.builtIn ? (
              <section className="library-block">
                <p>{library.description}</p>
                <p className="hint">
                  General gives every graph the node and the edge without a type. It is always on and cannot change. Add a library for the types of one kind of graph.
                </p>
              </section>
            ) : (
              <form className="library-block library-head" autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                <label className="field">
                  <span>Name</span>
                  <input value={draft.name} onChange={(e) => edit({ name: e.target.value })} {...NO_FILL} />
                </label>
                <label className="field">
                  <span>Description</span>
                  <textarea rows={2} value={draft.description} onChange={(e) => edit({ description: e.target.value })} {...NO_FILL} />
                </label>
                <p className="mono">id: {library.id}</p>
              </form>
            )}

            {!library.builtIn && (
              <section className="library-block">
                <h2>Node types</h2>
                <p className="hint">
                  A first-tier type is a node on its own. A second-tier type, such as a concept, is always within a node of one of the first-tier types you pick. Each id is unique across all
                  libraries.
                </p>
                <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                  <table className="term-table">
                    <thead>
                      <tr>
                        <th>Id</th>
                        <th>Name</th>
                        <th>Description</th>
                        <th>Tier</th>
                        <th aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.nodeTypes.map((term, index) => (
                        <tr key={index}>
                          <TermInputs term={term} onChange={(next) => setNodeType(index, { ...term, ...next })} />
                          <td>
                            <WithinField term={term} firstTier={firstTier} onChange={(within) => setNodeType(index, { ...term, within })} />
                          </td>
                          <RemoveButton name={term.name === "" ? "this type" : term.name} onRemove={() => removeNodeType(index)} />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </form>
                <div className="row">
                  <button type="button" onClick={() => edit({ nodeTypes: [...draft.nodeTypes, NEW_NODE_TYPE] })}>
                    Add node type
                  </button>
                </div>
              </section>
            )}

            {!library.builtIn && (
              <section className="library-block">
                <h2>Relationship types</h2>
                <p className="hint">The types an edge can have.</p>
                <form autoComplete="off" onSubmit={(e) => e.preventDefault()}>
                  <table className="term-table">
                    <thead>
                      <tr>
                        <th>Id</th>
                        <th>Name</th>
                        <th>Description</th>
                        <th aria-label="Remove" />
                      </tr>
                    </thead>
                    <tbody>
                      {draft.relationshipTypes.map((term, index) => (
                        <tr key={index}>
                          <TermInputs
                            term={term}
                            onChange={(next) => edit({ relationshipTypes: draft.relationshipTypes.map((item, i) => (i === index ? next : item)) })}
                          />
                          <RemoveButton
                            name={term.name === "" ? "this type" : term.name}
                            onRemove={() => edit({ relationshipTypes: draft.relationshipTypes.filter((_, i) => i !== index) })}
                          />
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </form>
                <div className="row">
                  <button type="button" onClick={() => edit({ relationshipTypes: [...draft.relationshipTypes, NEW_RELATIONSHIP_TYPE] })}>
                    Add relationship type
                  </button>
                </div>
              </section>
            )}

            <section className="library-block">
              <h2>Graphs that use it</h2>
              {users.length === 0 ? (
                <p className="meta">No graph uses this library yet. Turn it on in the Libraries section of the panel of a graph.</p>
              ) : (
                <ul className="versions">
                  {users.map((graph) => (
                    <li key={graph.id}>
                      <Link to={{ page: "graph", graphId: graph.id }}>{graph.name}</Link>
                      <span className="meta">{graph.nodeCount} nodes</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {!library.builtIn && (
              <section className="library-block">
                <button type="button" className="danger" onClick={() => void remove()}>
                  Delete library
                </button>
              </section>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
