import { toContent } from "../diff.ts";
import type { DraftState, GraphView } from "../model.ts";

// The undo history of the draft in one editor session. Each entry is one change: its label and the state of the draft
// before it. The state after entry i is the state before entry i + 1; the state after the last entry is the tip, which
// the history keeps from the first undo. index is the number of entries that apply now: an undo moves it down by one,
// a redo up by one, and a new change drops the entries after it.
export type HistoryEntry = { label: string; before: DraftState };

export type History = { entries: HistoryEntry[]; index: number; tip: DraftState | null };

export const EMPTY_HISTORY: History = { entries: [], index: 0, tip: null };

// The most changes that the history keeps.
const LIMIT = 200;

export const snapshotOf = (draft: GraphView): DraftState => ({
  content: toContent(draft),
  routes: Object.fromEntries(draft.edges.flatMap(({ id, route }) => (route == null ? [] : [[id, route]]))),
});

export const recordChange = (history: History, label: string, before: DraftState): History => {
  const entries = [...history.entries.slice(0, history.index), { label, before }].slice(-LIMIT);
  return { entries, index: entries.length, tip: null };
};

// The state of the draft after the first `index` entries, or null when the history does not have it.
export const stateAt = (history: History, index: number, current: DraftState): DraftState | null => {
  if (index < 0 || index > history.entries.length) return null;
  if (index === history.index) return current;
  if (index < history.entries.length) return history.entries[index]?.before ?? null;
  return history.tip;
};

// Moves the history to `index` after the draft was restored to stateAt(index).
export const movedTo = (history: History, index: number, current: DraftState): History => ({
  ...history,
  index,
  tip: history.index === history.entries.length ? current : history.tip,
});
