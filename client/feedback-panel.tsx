import { useState, type FormEvent } from "react";
import { CHANGE_VIEWS, type ChangeItem } from "../change-items.ts";
import type { Feedback, FeedbackInput } from "../model.ts";
import { InlineText, NO_FILL } from "./fields.tsx";

const itemName = (item: ChangeItem) => `${CHANGE_VIEWS.find(({ view }) => view === item.view)?.item ?? "Item"}: ${item.text}`;

// The open notes as a markdown list, to paste into a review, a ticket or a message.
export const feedbackText = (title: string, notes: Feedback[], itemOf: (ref: string) => ChangeItem) =>
  [`Feedback on "${title}"`, "", ...notes.filter(({ done }) => !done).map((note) => `- ${note.text}${note.ref == null ? "" : ` (${itemName(itemOf(note.ref))})`}`)].join("\n");

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  }
};

// The feedback on a change: notes that you write while you look at its views. A note can be about the selected item.
export const FeedbackSection = ({
  title,
  notes,
  selected,
  itemOf,
  onAdd,
  onUpdate,
  onDelete,
  onShow,
}: {
  title: string;
  notes: Feedback[];
  selected: ChangeItem | null;
  itemOf: (ref: string) => ChangeItem;
  onAdd: (input: FeedbackInput) => void;
  onUpdate: (id: string, patch: Partial<FeedbackInput>) => void;
  onDelete: (id: string) => void;
  onShow: (ref: string) => void;
}) => {
  const [text, setText] = useState("");
  const [general, setGeneral] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = notes.filter(({ done }) => !done);
  const done = notes.filter((note) => note.done);
  const about = general ? null : selected;

  const add = (event?: FormEvent) => {
    event?.preventDefault();
    if (text.trim() === "") return;
    onAdd({ text: text.trim(), ref: about?.ref ?? null });
    setText("");
  };

  const copy = () =>
    void copyText(feedbackText(title, notes, itemOf)).then((ok) => {
      setCopied(ok);
      setTimeout(() => setCopied(false), 1500);
    });

  const row = (note: Feedback) => {
    const item = note.ref == null ? null : itemOf(note.ref);
    return (
      <li key={note.id} className={`feedback-note${note.done ? " done" : ""}`}>
        <input type="checkbox" checked={note.done} onChange={(e) => onUpdate(note.id, { done: e.target.checked })} aria-label={note.done ? "Mark as open" : "Mark as done"} />
        <div className="feedback-body">
          <InlineText className="feedback-text" label="Note" value={note.text} multiline required onCommit={(next) => onUpdate(note.id, { text: next.trim() })} />
          {item != null && (
            <button type="button" className={`link feedback-item${item.broken ? " broken" : ""}`} onClick={() => onShow(item.ref)} title="Show this item">
              {itemName(item)}
            </button>
          )}
        </div>
        <button type="button" className="link" onClick={() => onDelete(note.id)} aria-label="Delete this note" title="Delete this note">
          ×
        </button>
      </li>
    );
  };

  return (
    <section className="section feedback">
      <div className="row feedback-head">
        <h2>Feedback{open.length > 0 && ` · ${open.length}`}</h2>
        <span className="spacer" />
        <button type="button" className="link" onClick={copy} disabled={open.length === 0} title="Copy the open notes as a list">
          {copied ? "Copied" : "Copy list"}
        </button>
      </div>
      <form className="feedback-new" autoComplete="off" onSubmit={add}>
        <textarea
          value={text}
          rows={2}
          placeholder={about == null ? "A note about this change" : "A note about the selected item"}
          aria-label="New note"
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) add();
          }}
          {...NO_FILL}
        />
        {selected != null && (
          <label className="check meta">
            <input type="checkbox" checked={!general} onChange={(e) => setGeneral(!e.target.checked)} />
            About {itemName(selected)}
          </label>
        )}
        <div className="row">
          <button type="submit" disabled={text.trim() === ""} title="Add the note (⌘Enter)">
            Add note
          </button>
        </div>
      </form>
      {notes.length === 0 ? (
        <p className="meta">No notes. Write one while you look at the views.</p>
      ) : (
        <ul className="feedback-list">{open.map(row)}</ul>
      )}
      {done.length > 0 && (
        <details className="feedback-done">
          <summary className="meta">Done · {done.length}</summary>
          <ul className="feedback-list">{done.map(row)}</ul>
        </details>
      )}
    </section>
  );
};
