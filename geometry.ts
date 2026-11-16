export type Point = { x: number; y: number };

export type Box = { x: number; y: number; width: number; height: number };

export type ParallelSlot = { index: number; count: number };

const center = (box: Box): Point => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));

export const sideAnchor = (box: Box, toward: Point, shift: Point = { x: 0, y: 0 }): Point => {
  const c = center(box);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (dx === 0 && dy === 0) return c;
  if (Math.abs(dx) / box.width >= Math.abs(dy) / box.height) {
    return { x: dx > 0 ? box.x + box.width : box.x, y: c.y + clamp(shift.y, box.height / 2 - 8) };
  }
  return { x: c.x + clamp(shift.x, box.width / 2 - 8), y: dy > 0 ? box.y + box.height : box.y };
};

export const parallelOffset = ({ index, count }: ParallelSlot, spacing = 36) => (index - (count - 1) / 2) * spacing;

export const edgePath = (sourceBox: Box, targetBox: Box, slot: ParallelSlot, flip: boolean) => {
  const sc = center(sourceBox);
  const tc = center(targetBox);
  const length = Math.hypot(tc.x - sc.x, tc.y - sc.y);
  const nx = length === 0 ? 0 : -(tc.y - sc.y) / length;
  const ny = length === 0 ? 0 : (tc.x - sc.x) / length;
  const offset = parallelOffset(slot) * (flip ? -1 : 1);
  const control = { x: (sc.x + tc.x) / 2 + nx * offset * 2, y: (sc.y + tc.y) / 2 + ny * offset * 2 };
  const shift = { x: (nx * offset) / 2, y: (ny * offset) / 2 };
  const start = sideAnchor(sourceBox, tc, shift);
  const end = sideAnchor(targetBox, sc, shift);
  const at = (t: number): Point =>
    offset === 0
      ? { x: start.x + (end.x - start.x) * t, y: start.y + (end.y - start.y) * t }
      : {
          x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
          y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
        };
  const path = offset === 0 ? `M${start.x} ${start.y} L${end.x} ${end.y}` : `M${start.x} ${start.y} Q${control.x} ${control.y} ${end.x} ${end.y}`;
  return { path, label: at(0.5), at };
};

export const loopPath = (box: Box, slot: ParallelSlot) => {
  const size = 28 + slot.index * 18;
  const startX = box.x + box.width - 26;
  const endX = box.x + box.width;
  const startY = box.y;
  const endY = box.y + 22;
  const path = `M${startX} ${startY} C${startX + size * 0.2} ${startY - size * 1.6}, ${endX + size * 1.6} ${endY - size * 0.2}, ${endX} ${endY}`;
  return { path, label: { x: endX + size * 0.55, y: startY - size * 0.55 } };
};

export const assignParallelSlots = (edges: { id: string; source: string; target: string }[]) => {
  const groups = new Map<string, string[]>();
  for (const edge of edges) {
    const key = edge.source === edge.target ? `loop:${edge.source}` : [edge.source, edge.target].sort().join("|");
    groups.set(key, [...(groups.get(key) ?? []), edge.id]);
  }
  const slots = new Map<string, ParallelSlot>();
  for (const ids of groups.values()) ids.forEach((id, index) => slots.set(id, { index, count: ids.length }));
  return slots;
};

// Edge labels are 11px text in a pill. These estimates are a little wide, so a label does not touch the next one.
export const LABEL_HEIGHT = 18;
const LABEL_GAP = 4;

export const labelSize = (text: string) => ({ width: Math.ceil(text.length * 6.6) + 16, height: LABEL_HEIGHT });

// Places on the edge where its label can go, in order of preference: the middle first, then further toward each end.
export const LABEL_STOPS = [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.18, 0.82];

export type Label = { id: string; candidates: Point[]; width: number; height: number };

const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

const boxAt = ({ width, height }: Label, at: Point): Box => ({
  x: at.x - width / 2 - LABEL_GAP / 2,
  y: at.y - height / 2 - LABEL_GAP / 2,
  width: width + LABEL_GAP,
  height: height + LABEL_GAP,
});

// Puts each label at the first of its candidate places (points on its own edge) that does not cover a node or a label
// placed before it. The label stays on its edge, so the edge line runs into the label and out of it. A label that finds
// no free place goes to its first candidate.
export const placeLabels = (labels: Label[], nodes: Box[]) => {
  const taken: Box[] = [];
  const placed = new Map<string, Point>();
  const first = (label: Label) => label.candidates[0] ?? { x: 0, y: 0 };
  const order = [...labels].sort((a, b) => first(a).y - first(b).y || first(a).x - first(b).x || a.id.localeCompare(b.id));
  for (const label of order) {
    const free = label.candidates.find((at) => {
      const box = boxAt(label, at);
      return !nodes.some((node) => overlaps(box, node)) && !taken.some((other) => overlaps(box, other));
    });
    const at = free ?? first(label);
    taken.push(boxAt(label, at));
    placed.set(label.id, at);
  }
  return placed;
};
