// The items of the four views of a change, and the trace links between them. The server and the client both use this file.

export const PSEUDO_LAYERS = ["ui", "api", "store", "data"] as const;

export type ChangeView = "idea" | "concepts" | "pseudocode" | "code";

// The views from the top down. A link goes from an item in one view to an item in the next view down.
export const CHANGE_VIEWS: { view: ChangeView; kind: ItemKind; name: string; item: string }[] = [
  { view: "idea", kind: "idea", name: "Idea", item: "Point" },
  { view: "concepts", kind: "node", name: "Concepts", item: "Concept" },
  { view: "pseudocode", kind: "pseudo", name: "Pseudocode", item: "Block" },
  { view: "code", kind: "hunk", name: "Code", item: "Hunk" },
];

export type ItemKind = "idea" | "node" | "pseudo" | "hunk";

export type Link = { from: string; to: string };

export const itemRef = (kind: ItemKind, id: string) => `${kind}:${id}`;

export const parseRef = (ref: string): { kind: ItemKind; id: string } | null => {
  const at = ref.indexOf(":");
  const kind = ref.slice(0, at);
  const id = ref.slice(at + 1);
  return at > 0 && id !== "" && CHANGE_VIEWS.some((view) => view.kind === kind) ? { kind: kind as ItemKind, id } : null;
};

export const levelOf = (kind: ItemKind) => CHANGE_VIEWS.findIndex((view) => view.kind === kind);

export const viewOfKind = (kind: ItemKind) => CHANGE_VIEWS[levelOf(kind)]?.view ?? "idea";

// The link between two items in next views, with the upper item first, or why the two items cannot have a link.
export const linkBetween = (a: string, b: string): Link | string => {
  const one = parseRef(a);
  const two = parseRef(b);
  if (one == null || two == null) return `The item ${one == null ? a : b} is not kind:id with a kind of idea, node, pseudo or hunk.`;
  const step = levelOf(two.kind) - levelOf(one.kind);
  if (step === 1) return { from: a, to: b };
  if (step === -1) return { from: b, to: a };
  return "A link connects an item to an item in the next view up or down.";
};

// The items that carry out the item (down) and the items that it carries out (up), through any number of views. A
// search goes in one direction only, so two ideas that share a concept do not select each other.
export const tracedFrom = (ref: string, links: Link[]) => {
  const found = new Set([ref]);
  const walk = (start: string, next: (link: Link) => [string, string]) => {
    const queue = [start];
    for (let item = queue.shift(); item != null; item = queue.shift()) {
      for (const link of links) {
        const [here, there] = next(link);
        if (here === item && !found.has(there)) {
          found.add(there);
          queue.push(there);
        }
      }
    }
  };
  walk(ref, (link) => [link.from, link.to]);
  walk(ref, (link) => [link.to, link.from]);
  return found;
};
