import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Change } from "../model.ts";
import { ApiError, api } from "./api.ts";
import { AppNav } from "./app-nav.tsx";
import { NO_FILL } from "./fields.tsx";
import { localTime } from "./graph-list.tsx";
import { go, Link } from "./router.tsx";

const NewChangeDialog = ({ onClose }: { onClose: () => void }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState("");
  const [repo, setRepo] = useState("");
  const [base, setBase] = useState("main");
  const [branch, setBranch] = useState("");
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => dialog.current?.showModal(), []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    try {
      const change = await api.createChange({ name, repo, base, branch });
      go({ page: "change", changeId: change.id, view: "idea" });
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.errors);
      else throw error;
    }
  };

  const field = (label: string, value: string, set: (value: string) => void, placeholder: string, autoFocus = false) => (
    <label className="field">
      <span>{label}</span>
      <input value={value} placeholder={placeholder} onChange={(e) => set(e.target.value)} autoFocus={autoFocus} {...NO_FILL} />
    </label>
  );

  return (
    <dialog ref={dialog} className="dialog" onClose={onClose}>
      <form className="section" autoComplete="off" onSubmit={(event) => void submit(event)}>
        <h2>New change</h2>
        {field("Name", name, setName, "What the change does", true)}
        {field("Repository", repo, setRepo, "/Users/me/Projects/app")}
        {field("Base branch", base, setBase, "main")}
        {field("Branch", branch, setBranch, "The branch of the change")}
        <p className="hint">The code view shows the diff of the branch since it left the base branch. You can set the branch later.</p>
        {errors.length > 0 && <p className="warning">{errors.join(" ")}</p>}
        <div className="row">
          <button type="submit" className="primary" disabled={name.trim() === ""}>
            Add
          </button>
          <button type="button" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
};

// Every change, the most recently changed first.
export const ChangeList = () => {
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    api
      .listChanges()
      .then(setChanges)
      .catch((error: unknown) => setErrors(error instanceof ApiError ? error.errors : [(error as Error).message]));
  }, []);

  return (
    <div className="app">
      <header className="toolbar">
        <h1>Diagram</h1>
        <AppNav current="changes" />
        <span className="spacer" />
        <button type="button" className="primary add" aria-label="New change" title="New change" onClick={() => setCreating(true)}>
          +
        </button>
      </header>
      {errors.length > 0 && <div className="banner errors">{errors.join(" ")}</div>}
      <div className="table-wrap">
        <table className="graph-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Branch</th>
              <th className="numeric">Links</th>
              <th>Changed</th>
            </tr>
          </thead>
          <tbody>
            {(changes ?? []).map((change) => (
              <tr key={change.id} onClick={() => go({ page: "change", changeId: change.id, view: "idea" })}>
                <td>
                  <div className="row-title">
                    <Link className="row-name" to={{ page: "change", changeId: change.id, view: "idea" }} onClick={(e) => e.stopPropagation()}>
                      {change.name}
                    </Link>
                  </div>
                  <div className="row-purpose">{change.ideas.length === 1 ? "1 idea item" : `${change.ideas.length} idea items`}</div>
                </td>
                <td className="mono">{change.branch === "" ? <span className="meta">none</span> : `${change.base}...${change.branch}`}</td>
                <td className="numeric">{change.links.length}</td>
                <td className="meta">{localTime(change.updatedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {changes != null && changes.length === 0 && <p className="empty">No changes yet. Click + to make one.</p>}
      </div>
      {creating && <NewChangeDialog onClose={() => setCreating(false)} />}
    </div>
  );
};
